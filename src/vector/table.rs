//! LanceDB table management for document vectors with HNSW vector index and FTS.

use crate::error::{DbError, Result};
use arrow_array::cast::AsArray;
use arrow_array::types::Float32Type;
use arrow_array::{Array, RecordBatchIterator};
use futures::TryStreamExt;
use std::sync::Arc;

/// Schema constants for the document vectors table.
const TABLE_NAME: &str = "document_vectors";
const EMBEDDING_DIM: i32 = 384;

/// LanceDB table for document vectors with HNSW index and FTS.
pub struct DocumentTable {
    table: lancedb::Table,
}

impl Clone for DocumentTable {
    fn clone(&self) -> Self {
        Self {
            table: self.table.clone(),
        }
    }
}

impl DocumentTable {
    /// Open existing table or create a new one.
    ///
    /// If the table exists but is corrupted (e.g. process killed mid-write),
    /// it is dropped and recreated.
    pub async fn open_or_create(connection: &lancedb::Connection) -> Result<Self> {
        // Try to open existing table
        match connection.open_table(TABLE_NAME).execute().await {
            Ok(table) => return Ok(Self { table }),
            Err(error) => {
                tracing::debug!(%error, "failed to open document_vectors table, will create");
            }
        }

        // Table doesn't exist or is unreadable — try creating it
        match Self::create_empty_table(connection).await {
            Ok(table) => return Ok(Self { table }),
            Err(error) => {
                tracing::warn!(
                    %error,
                    "failed to create document_vectors table, attempting recovery from corrupted state"
                );
            }
        }

        // Both open and create failed — table data exists but is corrupted.
        // Drop it and recreate from scratch.
        if let Err(error) = connection.drop_table(TABLE_NAME, &[]).await {
            tracing::warn!(%error, "drop_table failed during recovery, proceeding anyway");
        }

        let table = Self::create_empty_table(connection).await?;
        tracing::info!("document_vectors table recovered — documents will need re-indexing");

        Ok(Self { table })
    }

    /// Create an empty document vectors table.
    async fn create_empty_table(connection: &lancedb::Connection) -> Result<lancedb::Table> {
        let schema = Self::schema();
        let batches = RecordBatchIterator::new(vec![].into_iter().map(Ok), Arc::new(schema));

        connection
            .create_table(TABLE_NAME, Box::new(batches))
            .execute()
            .await
            .map_err(|e| DbError::LanceDb(e.to_string()).into())
    }

    /// Store a document vector with metadata.
    pub async fn store(
        &self,
        id: &str,
        content: &str,
        doc_type: &str,
        path: &str,
        title: &str,
        embedding: &[f32],
    ) -> Result<()> {
        if embedding.len() != EMBEDDING_DIM as usize {
            return Err(DbError::LanceDb(format!(
                "Embedding dimension mismatch: expected {}, got {}",
                EMBEDDING_DIM,
                embedding.len()
            ))
            .into());
        }

        // Ensure idempotent indexing by replacing any existing row for this id.
        // Without this, repeated workspace indexing would accumulate duplicates.
        self.delete(id).await?;

        use arrow_array::{FixedSizeListArray, RecordBatch, StringArray};

        let schema = Self::schema();

        let id_array = StringArray::from(vec![id]);
        let content_array = StringArray::from(vec![content]);
        let doc_type_array = StringArray::from(vec![doc_type]);
        let path_array = StringArray::from(vec![path]);
        let title_array = StringArray::from(vec![title]);

        let embedding_array = FixedSizeListArray::from_iter_primitive::<Float32Type, _, _>(
            vec![Some(embedding.iter().map(|v| Some(*v)).collect::<Vec<_>>())],
            EMBEDDING_DIM,
        );

        let batch = RecordBatch::try_new(
            Arc::new(schema),
            vec![
                Arc::new(id_array) as arrow_array::ArrayRef,
                Arc::new(content_array) as arrow_array::ArrayRef,
                Arc::new(doc_type_array) as arrow_array::ArrayRef,
                Arc::new(path_array) as arrow_array::ArrayRef,
                Arc::new(title_array) as arrow_array::ArrayRef,
                Arc::new(embedding_array) as arrow_array::ArrayRef,
            ],
        )
        .map_err(|e| DbError::LanceDb(e.to_string()))?;

        let batches = RecordBatchIterator::new(vec![Ok(batch)], Arc::new(Self::schema()));

        self.table
            .add(Box::new(batches))
            .execute()
            .await
            .map_err(|e| DbError::LanceDb(e.to_string()))?;

        Ok(())
    }

    /// Delete a document by ID.
    pub async fn delete(&self, id: &str) -> Result<()> {
        let predicate = format!("id = '{}'", id);
        self.table
            .delete(&predicate)
            .await
            .map_err(|e| DbError::LanceDb(e.to_string()))?;

        Ok(())
    }

    /// Vector similarity search using cosine distance.
    /// Returns (id, content, doc_type, path, title, distance) tuples sorted by distance ascending.
    pub async fn vector_search(
        &self,
        query_embedding: &[f32],
        limit: usize,
    ) -> Result<Vec<(String, String, String, String, String, f32)>> {
        if query_embedding.len() != EMBEDDING_DIM as usize {
            return Err(DbError::LanceDb(format!(
                "Query embedding dimension mismatch: expected {}, got {}",
                EMBEDDING_DIM,
                query_embedding.len()
            ))
            .into());
        }

        use lancedb::query::{ExecutableQuery, QueryBase};

        let results: Vec<arrow_array::RecordBatch> = self
            .table
            .query()
            .nearest_to(query_embedding)
            .map_err(|e| DbError::LanceDb(e.to_string()))?
            .limit(limit)
            .execute()
            .await
            .map_err(|e| DbError::LanceDb(e.to_string()))?
            .try_collect()
            .await
            .map_err(|e| DbError::LanceDb(e.to_string()))?;

        let mut matches = Vec::new();
        for batch in results {
            if let (
                Some(id_col),
                Some(content_col),
                Some(doc_type_col),
                Some(path_col),
                Some(title_col),
                Some(dist_col),
            ) = (
                batch.column_by_name("id"),
                batch.column_by_name("content"),
                batch.column_by_name("doc_type"),
                batch.column_by_name("path"),
                batch.column_by_name("title"),
                batch.column_by_name("_distance"),
            ) {
                let ids: &arrow_array::StringArray = id_col.as_string::<i32>();
                let contents: &arrow_array::StringArray = content_col.as_string::<i32>();
                let doc_types: &arrow_array::StringArray = doc_type_col.as_string::<i32>();
                let paths: &arrow_array::StringArray = path_col.as_string::<i32>();
                let titles: &arrow_array::StringArray = title_col.as_string::<i32>();
                let dists: &arrow_array::PrimitiveArray<Float32Type> = dist_col.as_primitive();

                for i in 0..ids.len() {
                    if ids.is_valid(i) && dists.is_valid(i) {
                        matches.push((
                            ids.value(i).to_string(),
                            contents.value(i).to_string(),
                            doc_types.value(i).to_string(),
                            paths.value(i).to_string(),
                            titles.value(i).to_string(),
                            dists.value(i),
                        ));
                    }
                }
            }
        }

        Ok(matches)
    }

    /// Full-text search on the content column.
    /// Returns (id, score) pairs sorted by score descending.
    pub async fn text_search(&self, query: &str, limit: usize) -> Result<Vec<(String, f32)>> {
        use lancedb::query::{ExecutableQuery, QueryBase};

        let results: Vec<arrow_array::RecordBatch> = self
            .table
            .query()
            .full_text_search(lance_index::scalar::FullTextSearchQuery::new(
                query.to_string(),
            ))
            .select(lancedb::query::Select::columns(&["id", "_score"]))
            .limit(limit)
            .execute()
            .await
            .map_err(|e| DbError::LanceDb(e.to_string()))?
            .try_collect()
            .await
            .map_err(|e| DbError::LanceDb(e.to_string()))?;

        let mut matches = Vec::new();
        for batch in results {
            if let (Some(id_col), Some(score_col)) =
                (batch.column_by_name("id"), batch.column_by_name("_score"))
            {
                let ids: &arrow_array::StringArray = id_col.as_string::<i32>();
                let scores: &arrow_array::PrimitiveArray<Float32Type> = score_col.as_primitive();

                for i in 0..ids.len() {
                    if ids.is_valid(i) && scores.is_valid(i) {
                        matches.push((ids.value(i).to_string(), scores.value(i)));
                    }
                }
            }
        }

        Ok(matches)
    }

    /// Create HNSW vector index on embedding and FTS index on content.
    pub async fn create_indexes(&self) -> Result<()> {
        // Create vector index, ignoring "already exists" style errors.
        match self
            .table
            .create_index(&["embedding"], lancedb::index::Index::Auto)
            .execute()
            .await
        {
            Ok(()) => {
                tracing::debug!("vector index created on embedding column");
            }
            Err(error) => {
                let message = error.to_string();
                if message.contains("already") || message.contains("index") {
                    tracing::trace!("vector index already exists");
                } else {
                    return Err(DbError::LanceDb(format!(
                        "Failed to create vector index: {}",
                        message
                    ))
                    .into());
                }
            }
        }

        // Create FTS index, ignoring "already exists" errors
        match self
            .table
            .create_index(&["content"], lancedb::index::Index::FTS(Default::default()))
            .execute()
            .await
        {
            Ok(()) => {
                tracing::debug!("FTS index created on content column");
            }
            Err(error) => {
                let message = error.to_string();
                if message.contains("already") || message.contains("index") {
                    tracing::trace!("FTS index already exists");
                } else {
                    return Err(DbError::LanceDb(format!(
                        "Failed to create FTS index: {}",
                        message
                    ))
                    .into());
                }
            }
        }

        Ok(())
    }

    /// Count all rows in the table.
    pub async fn count(&self) -> Result<usize> {
        use lancedb::query::{ExecutableQuery, QueryBase};

        let results: Vec<arrow_array::RecordBatch> = self
            .table
            .query()
            .select(lancedb::query::Select::columns(&["id"]))
            .execute()
            .await
            .map_err(|e| DbError::LanceDb(e.to_string()))?
            .try_collect()
            .await
            .map_err(|e| DbError::LanceDb(e.to_string()))?;

        Ok(results.iter().map(|b| b.num_rows()).sum())
    }

    /// List all document IDs currently stored in the table.
    pub async fn list_ids(&self) -> Result<Vec<String>> {
        use lancedb::query::{ExecutableQuery, QueryBase};

        let results: Vec<arrow_array::RecordBatch> = self
            .table
            .query()
            .select(lancedb::query::Select::columns(&["id"]))
            .execute()
            .await
            .map_err(|e| DbError::LanceDb(e.to_string()))?
            .try_collect()
            .await
            .map_err(|e| DbError::LanceDb(e.to_string()))?;

        let mut ids = Vec::new();
        for batch in results {
            if let Some(id_col) = batch.column_by_name("id") {
                let values: &arrow_array::StringArray = id_col.as_string::<i32>();
                for index in 0..values.len() {
                    if values.is_valid(index) {
                        ids.push(values.value(index).to_string());
                    }
                }
            }
        }

        Ok(ids)
    }

    /// Fetch document rows for the provided IDs.
    ///
    /// Returns tuples in the shape `(id, content, doc_type, path, title)`.
    pub async fn fetch_documents_by_ids(
        &self,
        ids: &[String],
    ) -> Result<Vec<(String, String, String, String, String)>> {
        use lancedb::query::{ExecutableQuery, QueryBase};

        if ids.is_empty() {
            return Ok(Vec::new());
        }

        let quoted_ids = ids
            .iter()
            .map(|id| format!("'{}'", id.replace('\'', "''")))
            .collect::<Vec<_>>()
            .join(", ");
        let predicate = format!("id IN ({quoted_ids})");

        let results: Vec<arrow_array::RecordBatch> = self
            .table
            .query()
            .only_if(predicate)
            .select(lancedb::query::Select::columns(&[
                "id", "content", "doc_type", "path", "title",
            ]))
            .execute()
            .await
            .map_err(|e| DbError::LanceDb(e.to_string()))?
            .try_collect()
            .await
            .map_err(|e| DbError::LanceDb(e.to_string()))?;

        let mut rows = Vec::new();
        for batch in results {
            if let (
                Some(id_col),
                Some(content_col),
                Some(doc_type_col),
                Some(path_col),
                Some(title_col),
            ) = (
                batch.column_by_name("id"),
                batch.column_by_name("content"),
                batch.column_by_name("doc_type"),
                batch.column_by_name("path"),
                batch.column_by_name("title"),
            ) {
                let ids: &arrow_array::StringArray = id_col.as_string::<i32>();
                let contents: &arrow_array::StringArray = content_col.as_string::<i32>();
                let doc_types: &arrow_array::StringArray = doc_type_col.as_string::<i32>();
                let paths: &arrow_array::StringArray = path_col.as_string::<i32>();
                let titles: &arrow_array::StringArray = title_col.as_string::<i32>();

                for index in 0..ids.len() {
                    if ids.is_valid(index)
                        && contents.is_valid(index)
                        && doc_types.is_valid(index)
                        && paths.is_valid(index)
                        && titles.is_valid(index)
                    {
                        rows.push((
                            ids.value(index).to_string(),
                            contents.value(index).to_string(),
                            doc_types.value(index).to_string(),
                            paths.value(index).to_string(),
                            titles.value(index).to_string(),
                        ));
                    }
                }
            }
        }

        Ok(rows)
    }

    /// Get the Arrow schema for the document vectors table.
    fn schema() -> arrow_schema::Schema {
        arrow_schema::Schema::new(vec![
            arrow_schema::Field::new("id", arrow_schema::DataType::Utf8, false),
            arrow_schema::Field::new("content", arrow_schema::DataType::Utf8, false),
            arrow_schema::Field::new("doc_type", arrow_schema::DataType::Utf8, false),
            arrow_schema::Field::new("path", arrow_schema::DataType::Utf8, false),
            arrow_schema::Field::new("title", arrow_schema::DataType::Utf8, false),
            arrow_schema::Field::new(
                "embedding",
                arrow_schema::DataType::FixedSizeList(
                    Arc::new(arrow_schema::Field::new(
                        "item",
                        arrow_schema::DataType::Float32,
                        true,
                    )),
                    EMBEDDING_DIM,
                ),
                false,
            ),
        ])
    }
}

#[cfg(test)]
mod tests {
    use super::DocumentTable;

    #[tokio::test]
    async fn store_replaces_existing_document_by_id() {
        let temp = tempfile::tempdir().expect("tempdir");
        let connection = lancedb::connect(temp.path().to_str().expect("path utf8"))
            .execute()
            .await
            .expect("connect lancedb");

        let table = DocumentTable::open_or_create(&connection)
            .await
            .expect("open_or_create table");

        let embedding = vec![0.0_f32; 384];

        table
            .store(
                "doc_1",
                "old content",
                "docs",
                "/tmp/doc.md",
                "Doc",
                &embedding,
            )
            .await
            .expect("first store");
        assert_eq!(table.count().await.expect("count"), 1);

        table
            .store(
                "doc_1",
                "new content",
                "docs",
                "/tmp/doc.md",
                "Doc",
                &embedding,
            )
            .await
            .expect("second store");
        assert_eq!(table.count().await.expect("count after replace"), 1);

        let matches = table
            .vector_search(&embedding, 5)
            .await
            .expect("vector search");
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].0, "doc_1");
        assert_eq!(matches[0].1, "new content");
    }

    #[tokio::test]
    async fn create_indexes_is_idempotent() {
        let temp = tempfile::tempdir().expect("tempdir");
        let connection = lancedb::connect(temp.path().to_str().expect("path utf8"))
            .execute()
            .await
            .expect("connect lancedb");

        let table = DocumentTable::open_or_create(&connection)
            .await
            .expect("open_or_create table");

        table.create_indexes().await.expect("create indexes first");
        table.create_indexes().await.expect("create indexes second");
    }
}
