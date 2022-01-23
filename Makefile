JSONNET_SCHEMAS_DIRECTORY := generators/schemas
JSONNET_SCHEMAS_FILES     := $(wildcard $(JSONNET_SCHEMAS_DIRECTORY)/*.jsonnet)
JSON_SCHEMAS_DIRECTORY    := src/autogen/schemas
JSON_SCHEMAS_FILES        := $(patsubst $(JSONNET_SCHEMAS_DIRECTORY)/%.jsonnet,$(JSON_SCHEMAS_DIRECTORY)/%.json,$(JSONNET_SCHEMAS_FILES))
TS_INTERFACES_DIRECTORY   := src/autogen/interfaces
TS_INTERFACES_FILES       := $(patsubst $(JSON_SCHEMAS_DIRECTORY)/%.schema.json,$(TS_INTERFACES_DIRECTORY)/%.ts,$(JSON_SCHEMAS_FILES))

$(info $$JSONNET_SCHEMAS_FILES is [${JSONNET_SCHEMAS_FILES}])
$(info $$JSON_SCHEMAS_FILES is [${JSON_SCHEMAS_FILES}])
$(info $$TS_INTERFACES_FILES is [${TS_INTERFACES_FILES}])


autogens: json-schemas ts-interfaces src/autogen/databaseJoinSpec.json

json-schemas: $(JSON_SCHEMAS_FILES)

ts-interfaces: $(TS_INTERFACES_FILES)

$(JSON_SCHEMAS_DIRECTORY)/%.json: $(JSONNET_SCHEMAS_DIRECTORY)/%.jsonnet
	jsonnet $< | tee $@

$(TS_INTERFACES_DIRECTORY)/%.ts: $(JSON_SCHEMAS_DIRECTORY)/%.schema.json
	json2ts $< | tee $@

src/autogen/databaseJoinSpec.json: $(wildcard generators/databaseJoinSpec.jsonnet)
	if [ "x$<" != "x" ]; then jsonnet $< | tee $@; else echo "no database join spec"; fi
