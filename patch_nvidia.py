import sys

with open('src/config.rs', 'r') as f:
    content = f.read()

# Replace the second gemini_key block with nvidia_key in load_from_env()
# First we find load_from_env definition
load_idx = content.find("pub fn load_from_env")
if load_idx == -1:
    print("Could not find load_from_env")
    sys.exit(1)

gemini_block = """        if let Some(gemini_key) = llm.gemini_key.clone() {
            llm.providers
                .entry("gemini".to_string())
                .or_insert_with(|| ProviderConfig {
                    api_type: ApiType::Gemini,
                    base_url: GEMINI_PROVIDER_BASE_URL.to_string(),
                    api_key: gemini_key,
                    name: None,
                });
        }"""

# Find all occurrences of gemini_block after load_idx
first_idx = content.find(gemini_block, load_idx)
if first_idx != -1:
    second_idx = content.find(gemini_block, first_idx + len(gemini_block))
    if second_idx != -1:
        # We replace the second block with nvidia
        nvidia_block = """        if let Some(nvidia_key) = llm.nvidia_key.clone() {
            llm.providers
                .entry("nvidia".to_string())
                .or_insert_with(|| ProviderConfig {
                    api_type: ApiType::OpenAiCompletions,
                    base_url: NVIDIA_PROVIDER_BASE_URL.to_string(),
                    api_key: nvidia_key,
                    name: None,
                });
        }"""
        
        content = content[:second_idx] + nvidia_block + content[second_idx + len(gemini_block):]
        with open('src/config.rs', 'w') as f:
            f.write(content)
        print("Replaced second gemini_key block with nvidia_key block.")
    else:
        print("Could not find second gemini_key block.")
else:
    print("Could not find first gemini_key block.")

