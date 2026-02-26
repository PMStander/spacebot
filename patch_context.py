with open('tests/context_dump.rs', 'r') as f:
    content = f.read()

conflict_1 = """<<<<<<< HEAD
        document_search: None,
=======
        sandbox,
        links: Arc::new(arc_swap::ArcSwap::from_pointee(Vec::new())),
        agent_names: Arc::new(std::collections::HashMap::new()),
>>>>>>> upstream/main"""

replacement_1 = """        document_search: None,
        sandbox,
        links: Arc::new(arc_swap::ArcSwap::from_pointee(Vec::new())),
        agent_names: Arc::new(std::collections::HashMap::new()),"""

content = content.replace(conflict_1, replacement_1)

conflict_2 = """<<<<<<< HEAD
        std::path::PathBuf::from("/tmp"),
        deps.sqlite_pool.clone(),
        deps.api_event_tx.clone(),
        deps.document_search.clone(),
=======
        deps.sandbox.clone(),
>>>>>>> upstream/main"""

replacement_2 = """        std::path::PathBuf::from("/tmp"),
        deps.sqlite_pool.clone(),
        deps.api_event_tx.clone(),
        deps.document_search.clone(),
        deps.sandbox.clone(),"""

content = content.replace(conflict_2, replacement_2)

with open('tests/context_dump.rs', 'w') as f:
    f.write(content)
