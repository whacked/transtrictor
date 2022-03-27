{ pkgs ? import <nixpkgs> {} }:

let
  nixShortcuts = (builtins.fetchurl {
    url = "https://raw.githubusercontent.com/whacked/setup/2d55546118ec3a57bdfda1861458ab8bce8c9c38/bash/nix_shortcuts.sh";
    sha256 = "11h3dipdrd2ym4ar59q3fligdmqhb5zzbbhnymi9vjdsgcs565iw";
  });
in pkgs.mkShell {
  buildInputs = [
    pkgs.gnumake
    pkgs.go
    pkgs.jsonnet
    pkgs.yarn
    # pkgs.deno
  ];

  nativeBuildInputs = [
    nixShortcuts
    ~/setup/bash/shell_shortcuts.sh
    ~/setup/bash/jsonnet_shortcuts.sh
  ];

  shellHook = ''
    export PATH=$(yarn bin):$PATH

    run-cli-tests() {
      # TODO: consolidate test runners in addition to the "jest" launch command
      _input=src/testdata/example-json-input-good.jsonnet
      _multiline_input=src/testdata/example-json-input-good-multiline.jsonl
      _schema=src/testdata/example-json-schema.jsonnet
      _transformer=src/testdata/sample-transformer.jsonata
      _post_schema=src/testdata/example-post-transform-schema.jsonnet

      ts-node scripts/cli.ts --schema $_schema --input $_input --transformer $_transformer --postTransformSchema $_post_schema
      jsonnet $_input | ts-node scripts/cli.ts --schema $_schema --input - --transformer $_transformer --postTransformSchema $_post_schema
      ts-node scripts/cli.ts --schema $_schema --jsonLines $_multiline_input --transformer $_transformer --postTransformSchema $_post_schema
      cat $_multiline_input | ts-node scripts/cli.ts --schema $_schema --jsonLines - --transformer $_transformer --postTransformSchema $_post_schema
    }

    alias run-tests='jest'
    alias start-front='parcel app/index.html'
    alias start-back='ts-node parsers/multi.ts'
    echo -e "\033[0;34m  generate-schema <some-data.json> to auto-generate a json schema \033[0m"

  '' + ''
    SERVER_ENDPOINT=http://localhost:1235
    # useful endpoints
    # $SERVER_ENDPOINT/api/_all_dbs
    # $SERVER_ENDPOINT/api/<dbname>/_all_docs
    add-schema-to-server() {
        if [ $# -ne 1 ]; then
            echo 'requires:  <path-to-schema>'
            return
        fi
        schema_path=$1
        jsonnet $schema_path | curl -s -H 'Content-Type: application/json' $SERVER_ENDPOINT/JsonSchemas -d @- | jq
    }

    add-data-to-server() {
        if [ $# -ne 2 ]; then
            echo 'requires:  <schema-name> <path-to-data>'
            return
        fi
        schema_name=$1
        path_to_data=$2
        curl -H 'Content-Type: application/json' $SERVER_ENDPOINT/SchemaTaggedPayloads/$schema_name -d@$path_to_data
    }

    render-transformed-data() {
        if [ $# -ne 5 ]; then
            echo 'requires:  <context> <input-data> <input-schema> <transformer> <output-schema>'
            return
        fi

        context=$1                # '{"device": "machine1"}'
        input_data=$2             # path/to/file.json
        input_schema=$3           # path/to/input.schema.jsonnet
        transformer=$4            # path/to/transformer.jsonata
        post_transform_schema=$5  # path/to/output.schema.jsonnet

        ts-node -T scripts/cli.ts \
            --context "$context" \
            --input "$input_data" \
            --schema "$input_schema" \
            --transformer "$transformer" \
            --postTransformSchema "$post_transform_schema"
    }

    generate-json-schema() {
        if [ $# -ne 2 ]; then
            echo 'requires:  <schema-name> <path-to-source-data>'
            return
        fi
        schema_name=$1
        input_file=$2
        ts-node scripts/cli.ts --input $input_file | jq '.title = "'$schema_name'"' | jq '.version = "'$(date +%F.1)'"' | jsonnetfmt -
    }

    add-transformed-data-to-server() {
        if [ $# -ne 6 ]; then
            echo 'requires:  <schema-name> <context> <input-data> <input-schema> <transformer> <output-schema>'
            return
        fi

        schema_name=$1            # MyResultantSchemaName
        render-transformed-data "$2" "$3" "$4" "$5" "$6" |
            curl -H 'Content-Type: application/json' $SERVER_ENDPOINT/SchemaTaggedPayloads/$schema_name -d @-
    }
  '' + ''
    echo-shortcuts ${__curPos.file}
  '';
}
