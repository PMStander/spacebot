use super::state::ApiState;

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use rig::completion::{CompletionModel, Prompt};
use std::collections::HashMap;
use std::sync::Arc;

#[derive(Serialize)]
pub(super) struct ProviderStatus {
    anthropic: bool,
    openai: bool,
    openrouter: bool,
    zhipu: bool,
    zhipu_sub: bool,
    groq: bool,
    together: bool,
    fireworks: bool,
    deepseek: bool,
    xai: bool,
    mistral: bool,
    gemini: bool,
    ollama: bool,
    opencode_zen: bool,
    nvidia: bool,
    minimax: bool,
    moonshot: bool,
    zai_coding_plan: bool,
}

#[derive(Serialize)]
pub(super) struct ProvidersResponse {
    providers: ProviderStatus,
    has_any: bool,
}

#[derive(Deserialize)]
pub(super) struct ProviderUpdateRequest {
    provider: String,
    api_key: String,
}

#[derive(Serialize)]
pub(super) struct ProviderUpdateResponse {
    success: bool,
    message: String,
}

#[derive(Deserialize)]
pub(super) struct ProviderModelTestRequest {
    provider: String,
    api_key: String,
    model: String,
}

#[derive(Serialize)]
pub(super) struct ProviderModelTestResponse {
    success: bool,
    message: String,
    provider: String,
    model: String,
    sample: Option<String>,
}

fn provider_toml_key(provider: &str) -> Option<&'static str> {
    match provider {
        "anthropic" => Some("anthropic_key"),
        "openai" => Some("openai_key"),
        "openrouter" => Some("openrouter_key"),
        "zhipu" => Some("zhipu_key"),
        "groq" => Some("groq_key"),
        "together" => Some("together_key"),
        "fireworks" => Some("fireworks_key"),
        "deepseek" => Some("deepseek_key"),
        "xai" => Some("xai_key"),
        "mistral" => Some("mistral_key"),
        "gemini" => Some("gemini_key"),
        "ollama" => Some("ollama_base_url"),
        "opencode-zen" => Some("opencode_zen_key"),
        "nvidia" => Some("nvidia_key"),
        "minimax" => Some("minimax_key"),
        "moonshot" => Some("moonshot_key"),
        "zai-coding-plan" => Some("zai_coding_plan_key"),
        _ => None,
    }
}

fn model_matches_provider(provider: &str, model: &str) -> bool {
    crate::llm::routing::provider_from_model(model) == provider
}

fn build_test_llm_config(provider: &str, credential: &str) -> crate::config::LlmConfig {
    use crate::config::{ApiType, ProviderConfig};

    let mut providers = HashMap::new();
    let provider_config = match provider {
        "anthropic" => Some(ProviderConfig {
            api_type: ApiType::Anthropic,
            base_url: "https://api.anthropic.com".to_string(),
            api_key: credential.to_string(),
            name: None,
        }),
        "openai" => Some(ProviderConfig {
            api_type: ApiType::OpenAiCompletions,
            base_url: "https://api.openai.com".to_string(),
            api_key: credential.to_string(),
            name: None,
        }),
        "openrouter" => Some(ProviderConfig {
            api_type: ApiType::OpenAiCompletions,
            base_url: "https://openrouter.ai/api".to_string(),
            api_key: credential.to_string(),
            name: None,
        }),
        "zhipu" => Some(ProviderConfig {
            api_type: ApiType::OpenAiCompletions,
            base_url: "https://api.z.ai/api/paas/v4".to_string(),
            api_key: credential.to_string(),
            name: None,
        }),
        "groq" => Some(ProviderConfig {
            api_type: ApiType::OpenAiCompletions,
            base_url: "https://api.groq.com/openai".to_string(),
            api_key: credential.to_string(),
            name: None,
        }),
        "together" => Some(ProviderConfig {
            api_type: ApiType::OpenAiCompletions,
            base_url: "https://api.together.xyz".to_string(),
            api_key: credential.to_string(),
            name: None,
        }),
        "fireworks" => Some(ProviderConfig {
            api_type: ApiType::OpenAiCompletions,
            base_url: "https://api.fireworks.ai/inference".to_string(),
            api_key: credential.to_string(),
            name: None,
        }),
        "deepseek" => Some(ProviderConfig {
            api_type: ApiType::OpenAiCompletions,
            base_url: "https://api.deepseek.com".to_string(),
            api_key: credential.to_string(),
            name: None,
        }),
        "xai" => Some(ProviderConfig {
            api_type: ApiType::OpenAiCompletions,
            base_url: "https://api.x.ai".to_string(),
            api_key: credential.to_string(),
            name: None,
        }),
        "mistral" => Some(ProviderConfig {
            api_type: ApiType::OpenAiCompletions,
            base_url: "https://api.mistral.ai".to_string(),
            api_key: credential.to_string(),
            name: None,
        }),
        "gemini" => Some(ProviderConfig {
            api_type: ApiType::Gemini,
            base_url: crate::config::GEMINI_PROVIDER_BASE_URL.to_string(),
            api_key: credential.to_string(),
            name: None,
        }),
        "opencode-zen" => Some(ProviderConfig {
            api_type: ApiType::OpenAiCompletions,
            base_url: "https://opencode.ai/zen".to_string(),
            api_key: credential.to_string(),
            name: None,
        }),
        "nvidia" => Some(ProviderConfig {
            api_type: ApiType::OpenAiCompletions,
            base_url: crate::config::NVIDIA_PROVIDER_BASE_URL.to_string(),
            api_key: credential.to_string(),
            name: None,
        }),
        "minimax" => Some(ProviderConfig {
            api_type: ApiType::Anthropic,
            base_url: "https://api.minimax.io/anthropic".to_string(),
            api_key: credential.to_string(),
            name: None,
        }),
        "moonshot" => Some(ProviderConfig {
            api_type: ApiType::OpenAiCompletions,
            base_url: "https://api.moonshot.ai".to_string(),
            api_key: credential.to_string(),
            name: None,
        }),
        "zai-coding-plan" => Some(ProviderConfig {
            api_type: ApiType::OpenAiCompletions,
            base_url: "https://api.z.ai/api/coding/paas/v4".to_string(),
            api_key: credential.to_string(),
            name: None,
        }),
        _ => None,
    };

    if let Some(provider_config) = provider_config {
        providers.insert(provider.to_string(), provider_config);
    }

    crate::config::LlmConfig {
        anthropic_key: (provider == "anthropic").then(|| credential.to_string()),
        openai_key: (provider == "openai").then(|| credential.to_string()),
        openrouter_key: (provider == "openrouter").then(|| credential.to_string()),
        zhipu_key: (provider == "zhipu").then(|| credential.to_string()),
        zhipu_sub_key: (provider == "zhipu-sub").then(|| credential.to_string()),
        groq_key: (provider == "groq").then(|| credential.to_string()),
        together_key: (provider == "together").then(|| credential.to_string()),
        fireworks_key: (provider == "fireworks").then(|| credential.to_string()),
        deepseek_key: (provider == "deepseek").then(|| credential.to_string()),
        xai_key: (provider == "xai").then(|| credential.to_string()),
        mistral_key: (provider == "mistral").then(|| credential.to_string()),
        gemini_key: (provider == "gemini").then(|| credential.to_string()),
        ollama_key: None,
        ollama_base_url: (provider == "ollama").then(|| credential.to_string()),
        opencode_zen_key: (provider == "opencode-zen").then(|| credential.to_string()),
        nvidia_key: (provider == "nvidia").then(|| credential.to_string()),
        minimax_key: (provider == "minimax").then(|| credential.to_string()),
        moonshot_key: (provider == "moonshot").then(|| credential.to_string()),
        zai_coding_plan_key: (provider == "zai-coding-plan").then(|| credential.to_string()),
        providers,
    }
}

pub(super) async fn get_providers(
    State(state): State<Arc<ApiState>>,
) -> Result<Json<ProvidersResponse>, StatusCode> {
    let config_path = state.config_path.read().await.clone();

    let (
        anthropic,
        openai,
        openrouter,
        zhipu,
        zhipu_sub,
        groq,
        together,
        fireworks,
        deepseek,
        xai,
        mistral,
        gemini,
        ollama,
        opencode_zen,
        nvidia,
        minimax,
        moonshot,
        zai_coding_plan,
    ) = if config_path.exists() {
        let content = tokio::fs::read_to_string(&config_path)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        let doc: toml_edit::DocumentMut = content
            .parse()
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        let has_value = |key: &str, env_var: &str| -> bool {
            if let Some(llm) = doc.get("llm")
                && let Some(val) = llm.get(key)
                && let Some(s) = val.as_str()
            {
                if let Some(var_name) = s.strip_prefix("env:") {
                    return std::env::var(var_name).is_ok();
                }
                return !s.is_empty();
            }
            std::env::var(env_var).is_ok()
        };

        (
            has_value("anthropic_key", "ANTHROPIC_API_KEY"),
            has_value("openai_key", "OPENAI_API_KEY"),
            has_value("openrouter_key", "OPENROUTER_API_KEY"),
            has_value("zhipu_key", "ZHIPU_API_KEY"),
            has_value("zhipu_sub_key", "ZHIPU_SUB_API_KEY"),
            has_value("groq_key", "GROQ_API_KEY"),
            has_value("together_key", "TOGETHER_API_KEY"),
            has_value("fireworks_key", "FIREWORKS_API_KEY"),
            has_value("deepseek_key", "DEEPSEEK_API_KEY"),
            has_value("xai_key", "XAI_API_KEY"),
            has_value("mistral_key", "MISTRAL_API_KEY"),
            has_value("gemini_key", "GEMINI_API_KEY"),
            has_value("ollama_base_url", "OLLAMA_BASE_URL")
                || has_value("ollama_key", "OLLAMA_API_KEY"),
            has_value("opencode_zen_key", "OPENCODE_ZEN_API_KEY"),
            has_value("nvidia_key", "NVIDIA_API_KEY"),
            has_value("minimax_key", "MINIMAX_API_KEY"),
            has_value("moonshot_key", "MOONSHOT_API_KEY"),
            has_value("zai_coding_plan_key", "ZAI_CODING_PLAN_API_KEY"),
        )
    } else {
        (
            std::env::var("ANTHROPIC_API_KEY").is_ok(),
            std::env::var("OPENAI_API_KEY").is_ok(),
            std::env::var("OPENROUTER_API_KEY").is_ok(),
            std::env::var("ZHIPU_API_KEY").is_ok(),
            std::env::var("ZHIPU_SUB_API_KEY").is_ok(),
            std::env::var("GROQ_API_KEY").is_ok(),
            std::env::var("TOGETHER_API_KEY").is_ok(),
            std::env::var("FIREWORKS_API_KEY").is_ok(),
            std::env::var("DEEPSEEK_API_KEY").is_ok(),
            std::env::var("XAI_API_KEY").is_ok(),
            std::env::var("MISTRAL_API_KEY").is_ok(),
            std::env::var("GEMINI_API_KEY").is_ok(),
            std::env::var("OLLAMA_BASE_URL").is_ok() || std::env::var("OLLAMA_API_KEY").is_ok(),
            std::env::var("OPENCODE_ZEN_API_KEY").is_ok(),
            std::env::var("NVIDIA_API_KEY").is_ok(),
            std::env::var("MINIMAX_API_KEY").is_ok(),
            std::env::var("MOONSHOT_API_KEY").is_ok(),
            std::env::var("ZAI_CODING_PLAN_API_KEY").is_ok(),
        )
    };

    let providers = ProviderStatus {
        anthropic,
        openai,
        openrouter,
        zhipu,
        zhipu_sub,
        groq,
        together,
        fireworks,
        deepseek,
        xai,
        mistral,
        gemini,
        ollama,
        opencode_zen,
        nvidia,
        minimax,
        moonshot,
        zai_coding_plan,
    };
    let has_any = providers.anthropic
        || providers.openai
        || providers.openrouter
        || providers.zhipu
        || providers.zhipu_sub
        || providers.groq
        || providers.together
        || providers.fireworks
        || providers.deepseek
        || providers.xai
        || providers.mistral
        || providers.gemini
        || providers.ollama
        || providers.opencode_zen
        || providers.nvidia
        || providers.minimax
        || providers.moonshot
        || providers.zai_coding_plan;

    Ok(Json(ProvidersResponse { providers, has_any }))
}

pub(super) async fn update_provider(
    State(state): State<Arc<ApiState>>,
    Json(request): Json<ProviderUpdateRequest>,
) -> Result<Json<ProviderUpdateResponse>, StatusCode> {
    let key_name = match request.provider.as_str() {
        "anthropic" => "anthropic_key",
        "openai" => "openai_key",
        "openrouter" => "openrouter_key",
        "zhipu" => "zhipu_key",
        "zhipu-sub" => "zhipu_sub_key",
        "groq" => "groq_key",
        "together" => "together_key",
        "fireworks" => "fireworks_key",
        "deepseek" => "deepseek_key",
        "xai" => "xai_key",
        "mistral" => "mistral_key",
        "opencode-zen" => "opencode_zen_key",
        "minimax" => "minimax_key",
        "moonshot" => "moonshot_key",
        "zai-coding-plan" => "zai_coding_plan_key",
        "gemini" => "gemini_key",
        _ => {
            return Ok(Json(ProviderUpdateResponse {
                success: false,
                message: format!("Unknown provider: {}", request.provider),
            }));
        }
    };

    if request.api_key.trim().is_empty() {
        return Ok(Json(ProviderUpdateResponse {
            success: false,
            message: "API key cannot be empty".into(),
        }));
    }

    let config_path = state.config_path.read().await.clone();

    let content = if config_path.exists() {
        tokio::fs::read_to_string(&config_path)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    } else {
        String::new()
    };

    let mut doc: toml_edit::DocumentMut = content
        .parse()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if doc.get("llm").is_none() {
        doc["llm"] = toml_edit::Item::Table(toml_edit::Table::new());
    }

    doc["llm"][key_name] = toml_edit::value(request.api_key);

    // Auto-set routing defaults if the current routing points to a provider
    // the user doesn't have a key for.
    let should_set_routing = {
        let current_channel = doc
            .get("defaults")
            .and_then(|d| d.get("routing"))
            .and_then(|r| r.get("channel"))
            .and_then(|v| v.as_str())
            .unwrap_or("anthropic/claude-sonnet-4-20250514");

        let current_provider = crate::llm::routing::provider_from_model(current_channel);

        let has_provider_key = |toml_key: &str, env_var: &str| -> bool {
            if let Some(s) = doc
                .get("llm")
                .and_then(|l| l.get(toml_key))
                .and_then(|v| v.as_str())
            {
                if let Some(var_name) = s.strip_prefix("env:") {
                    return std::env::var(var_name).is_ok();
                }
                return !s.is_empty();
            }
            std::env::var(env_var).is_ok()
        };

        let has_key_for_current = match current_provider {
            "anthropic" => has_provider_key("anthropic_key", "ANTHROPIC_API_KEY"),
            "openai" => has_provider_key("openai_key", "OPENAI_API_KEY"),
            "openrouter" => has_provider_key("openrouter_key", "OPENROUTER_API_KEY"),
            "zhipu" => has_provider_key("zhipu_key", "ZHIPU_API_KEY"),
            "zhipu-sub" => has_provider_key("zhipu_sub_key", "ZHIPU_SUB_API_KEY"),
            "groq" => has_provider_key("groq_key", "GROQ_API_KEY"),
            "together" => has_provider_key("together_key", "TOGETHER_API_KEY"),
            "fireworks" => has_provider_key("fireworks_key", "FIREWORKS_API_KEY"),
            "deepseek" => has_provider_key("deepseek_key", "DEEPSEEK_API_KEY"),
            "xai" => has_provider_key("xai_key", "XAI_API_KEY"),
            "mistral" => has_provider_key("mistral_key", "MISTRAL_API_KEY"),
            "gemini" => has_provider_key("gemini_key", "GEMINI_API_KEY"),
            "ollama" => has_provider_key("ollama_base_url", "OLLAMA_BASE_URL"),
            "opencode-zen" => has_provider_key("opencode_zen_key", "OPENCODE_ZEN_API_KEY"),
            "nvidia" => has_provider_key("nvidia_key", "NVIDIA_API_KEY"),
            "minimax" => has_provider_key("minimax_key", "MINIMAX_API_KEY"),
            "moonshot" => has_provider_key("moonshot_key", "MOONSHOT_API_KEY"),
            "zai-coding-plan" => has_provider_key("zai_coding_plan_key", "ZAI_CODING_PLAN_API_KEY"),
            _ => false,
        };

        !has_key_for_current
    };

    if should_set_routing {
        let routing = crate::llm::routing::defaults_for_provider(&request.provider);

        if doc.get("defaults").is_none() {
            doc["defaults"] = toml_edit::Item::Table(toml_edit::Table::new());
        }

        if let Some(defaults) = doc.get_mut("defaults").and_then(|d| d.as_table_mut()) {
            if defaults.get("routing").is_none() {
                defaults["routing"] = toml_edit::Item::Table(toml_edit::Table::new());
            }

            if let Some(routing_table) = defaults.get_mut("routing").and_then(|r| r.as_table_mut())
            {
                routing_table["channel"] = toml_edit::value(&routing.channel);
                routing_table["branch"] = toml_edit::value(&routing.branch);
                routing_table["worker"] = toml_edit::value(&routing.worker);
                routing_table["compactor"] = toml_edit::value(&routing.compactor);
                routing_table["cortex"] = toml_edit::value(&routing.cortex);
            }
        }
    }

    tokio::fs::write(&config_path, doc.to_string())
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    state
        .provider_setup_tx
        .try_send(crate::ProviderSetupEvent::ProvidersConfigured)
        .ok();

    let routing_note = if should_set_routing {
        format!(
            " Model routing updated to use {} defaults.",
            request.provider
        )
    } else {
        String::new()
    };

    Ok(Json(ProviderUpdateResponse {
        success: true,
        message: format!(
            "Provider '{}' configured.{}",
            request.provider, routing_note
        ),
    }))
}

pub(super) async fn delete_provider(
    State(state): State<Arc<ApiState>>,
    axum::extract::Path(provider): axum::extract::Path<String>,
) -> Result<Json<ProviderUpdateResponse>, StatusCode> {
    let key_name = match provider.as_str() {
        "anthropic" => "anthropic_key",
        "openai" => "openai_key",
        "openrouter" => "openrouter_key",
        "zhipu" => "zhipu_key",
        "zhipu-sub" => "zhipu_sub_key",
        "groq" => "groq_key",
        "together" => "together_key",
        "fireworks" => "fireworks_key",
        "deepseek" => "deepseek_key",
        "xai" => "xai_key",
        "mistral" => "mistral_key",
        "opencode-zen" => "opencode_zen_key",
        "minimax" => "minimax_key",
        "moonshot" => "moonshot_key",
        "zai-coding-plan" => "zai_coding_plan_key",
        "gemini" => "gemini_key",
        _ => {
            return Ok(Json(ProviderUpdateResponse {
                success: false,
                message: format!("Unknown provider: {}", provider),
            }));
        }
    };

    let config_path = state.config_path.read().await.clone();
    if !config_path.exists() {
        return Ok(Json(ProviderUpdateResponse {
            success: false,
            message: "No config file found".into(),
        }));
    }

    let content = tokio::fs::read_to_string(&config_path)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut doc: toml_edit::DocumentMut = content
        .parse()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if let Some(llm) = doc.get_mut("llm")
        && let Some(table) = llm.as_table_mut()
    {
        table.remove(key_name);
    }

    tokio::fs::write(&config_path, doc.to_string())
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(ProviderUpdateResponse {
        success: true,
        message: format!("Provider '{}' removed", provider),
    }))
}

/// Live provider/model connectivity test.
///
/// Sends a minimal prompt to the specified provider and model to verify the
/// API key works and the model is reachable.
pub(super) async fn test_provider_model(
    Json(request): Json<ProviderModelTestRequest>,
) -> Result<Json<ProviderModelTestResponse>, StatusCode> {
    if provider_toml_key(&request.provider).is_none() {
        return Ok(Json(ProviderModelTestResponse {
            success: false,
            message: format!("Unknown provider: {}", request.provider),
            provider: request.provider,
            model: request.model,
            sample: None,
        }));
    }

    if request.api_key.trim().is_empty() {
        return Ok(Json(ProviderModelTestResponse {
            success: false,
            message: "API key cannot be empty".to_string(),
            provider: request.provider,
            model: request.model,
            sample: None,
        }));
    }

    if request.model.trim().is_empty() {
        return Ok(Json(ProviderModelTestResponse {
            success: false,
            message: "Model cannot be empty".to_string(),
            provider: request.provider,
            model: request.model,
            sample: None,
        }));
    }

    if !model_matches_provider(&request.provider, &request.model) {
        return Ok(Json(ProviderModelTestResponse {
            success: false,
            message: format!(
                "Model '{}' does not match provider '{}'.",
                request.model, request.provider
            ),
            provider: request.provider,
            model: request.model,
            sample: None,
        }));
    }

    let llm_config = build_test_llm_config(&request.provider, request.api_key.trim());
    let llm_manager = match crate::llm::LlmManager::new(llm_config).await {
        Ok(manager) => Arc::new(manager),
        Err(error) => {
            return Ok(Json(ProviderModelTestResponse {
                success: false,
                message: format!("Failed to initialize provider: {error}"),
                provider: request.provider,
                model: request.model,
                sample: None,
            }));
        }
    };

    let model = crate::llm::SpacebotModel::make(&llm_manager, request.model.clone());
    let agent = rig::agent::AgentBuilder::new(model)
        .preamble("You are running a provider connectivity check. Reply with exactly: OK")
        .build();

    match agent.prompt("Connection test").await {
        Ok(sample) => Ok(Json(ProviderModelTestResponse {
            success: true,
            message: "Model responded successfully".to_string(),
            provider: request.provider,
            model: request.model,
            sample: Some(sample),
        })),
        Err(error) => Ok(Json(ProviderModelTestResponse {
            success: false,
            message: format!("Model test failed: {error}"),
            provider: request.provider,
            model: request.model,
            sample: None,
        })),
    }
}
