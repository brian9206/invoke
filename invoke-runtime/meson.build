project(
  'invoke-supervisor',
  'cpp',
  version : '1.0.0',
  default_options : [
    'cpp_std=c++20',
    'optimization=2',
    'b_lto=true',
    'warning_level=2',
  ],
)

# ── nlohmann/json (header-only) ──────────────────────────────────────────
json_dep = dependency('nlohmann_json', required : false)
if not json_dep.found()
  json_dep = subproject('nlohmann_json').get_variable('nlohmann_json_dep')
endif

# ── Sources ──────────────────────────────────────────────────────────────
src = files(
  'supervisor/src/main.cpp',
  'supervisor/src/supervisor.cpp',
  'supervisor/src/protocol.cpp',
  'supervisor/src/sandbox.cpp',
  'supervisor/src/cgroup.cpp',
)

executable(
  'invoke-supervisor',
  src,
  dependencies : [json_dep],
  include_directories : include_directories('supervisor/src'),
  install : true,
)
