import sys

with open('src/config.rs', 'r') as f:
    content = f.read()

load_idx = content.find("pub fn load_from_env")
if load_idx == -1:
    sys.exit(1)

old_api_block = "api: ApiConfig::default(),"
new_api_block = """api: {
                let default_api = ApiConfig::default();
                ApiConfig {
                    bind: hosted_api_bind(default_api.bind),
                    ..default_api
                }
            },"""

idx = content.find(old_api_block, load_idx)
if idx != -1:
    content = content[:idx] + new_api_block + content[idx + len(old_api_block):]
    with open('src/config.rs', 'w') as f:
        f.write(content)
    print("Replaced api block")
else:
    print("Could not find api block")

