{ pkgs ? import <nixpkgs> {} }:

let
  arangodb = import ./nix/arangodb.nix {};
  psql = import ./nix/postgresql.nix {};
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
    pkgs.miller
    # pkgs.deno

    pkgs.couchdb3
    pkgs.crudini
  ] ++ arangodb.buildInputs ++ psql.buildInputs;

  nativeBuildInputs = [
    nixShortcuts
    ~/setup/bash/shell_shortcuts.sh
    ~/setup/bash/jsonnet_shortcuts.sh
  ] ++ psql.nativeBuildInputs;

  shellHook = arangodb.shellHook + psql.shellHook + ''
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
    alias start-dev-webserver='ts-node-dev --respawn app/webserver.ts'
    echo -e "\033[0;34m  generate-schema <some-data.json> to auto-generate a json schema \033[0m"
    alias cli='ts-node -T scripts/cli.ts'

  '' + ''
    . .env
    SERVER_ENDPOINT=http://localhost:1235

    # FIXME reconcile with defs.ts / autogen
    JSON_SCHEMAS_TABLE_NAME=json-schemas  # JsonSchemas
    TRANSFORMERS_TABLE_NAME=transformers  # Transformers
    SCHEMA_TAGGED_PAYLOADS_TABLE_NAME=schema-tagged-payloads  # SchemaTaggedPayloads

    CURL_BASIC_AUTH="-u $COUCHDB_AUTH_USERNAME:$COUCHDB_AUTH_PASSWORD"

    # useful endpoints
    # $SERVER_ENDPOINT/api/_all_dbs
    # $SERVER_ENDPOINT/api/<dbname>/_all_docs
    add-schema-to-server() {
        if [ $# -ne 1 ]; then
            echo 'requires:  <path-to-schema>'
            return
        fi
        schema_path=$1
        jsonnet $schema_path | curl $CURL_BASIC_AUTH -s -H 'Content-Type: application/json' $SERVER_ENDPOINT/$JSON_SCHEMAS_TABLE_NAME -d @- | jq
    }

    add-data-to-server() {
        context_params_string="?"
        while true; do
            case $1 in
                --created-at)
                    shift
                    context_params_string="$context_params_string&createdAt=$1"
                    shift
                    ;;

                --device)
                    shift
                    device_string="?createdAt=$1"
                    context_params_string="$context_params_string&device=$1"
                    shift
                    ;;

                *)
                    break
                    ;;
            esac
        done
        if [ $# -lt 2 ]; then
            echo 'requires:  [--created-at time] [--device device-name] <schema-name> <path-to-data>'
            return
        fi
        schema_name=$1
        path_to_data=$2
        curl $CURL_BASIC_AUTH -s -H 'Content-Type: application/json' "$SERVER_ENDPOINT/$SCHEMA_TAGGED_PAYLOADS_TABLE_NAME/$schema_name$context_params_string" -d@$path_to_data
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
            curl $CURL_BASIC_AUTH -H 'Content-Type: application/json' $SERVER_ENDPOINT/$SCHEMA_TAGGED_PAYLOADS_TABLE_NAME/$schema_name -d @-
    }

    add-transformer-to-server() {
        if [ $# -lt 1 ]; then
            echo 'requires:  <path-to-file>'
            return
        fi

        while [ $# -gt 0 ]; do
            echo $1
            case $1 in
                input*=*)
                    inputsarg="-F inputSchemas=$(echo $1 | cut -d= -f2)"
                    ;;

                output*=*)
                    outputarg="-F outputSchema=$(echo $1 | cut -d= -f2)"
                    ;;

                *)
                    if [ ! -e $1 ]; then
                        echo "ERROR: no file found at $1"
                        return
                    fi
                    source_file=$1
                    ;;
            esac
            shift
        done
        curl $CURL_BASIC_AUTH -vvv $inputsarg $outputarg -F "file=@$source_file" $SERVER_ENDPOINT/$TRANSFORMERS_TABLE_NAME
    }
  '' + ''
    # sqlite interaction
    list-databases() {  # pouchdb backend only for now
        DBS_DBS_PATH=$POUCHDB_DATABASE_PREFIX/pouch__all_dbs__
        if [ ! -e $DBS_DBS_PATH ]; then
            echo "did not find meta database at $DBS_DBS_PATH; you might need to set POUCHDB_DATABASE_PREFIX first"
            return
        fi
        echo "=== available databases ==="
        sqlite3 $DBS_DBS_PATH 'SELECT id FROM "document-store"' | sed 's|^db_||' | grep -v '^_'
    }

    list-documents-in-database() {
        if [ $# -lt 1 ]; then
            echo "need <database-name>"
            list-databases
            return
        fi
        database_name=$1
        if [ $(list-databases | grep "^$database_name$" | wc -l) -ne 1 ]; then
            echo "no such database: $database_name"
            list-databases
        fi
        case $2 in
            --json)
                FILTER() {
                    cat - | sed 's/[^|]\+|//'
                }
                ;;

            *)
                FILTER() {
                    cat
                }
                ;;
        esac
        sqlite3 $POUCHDB_DATABASE_PREFIX/$database_name 'SELECT ds.id, bs.json FROM "document-store" AS ds, "by-sequence" AS bs WHERE ds.id = bs.doc_id' | FILTER
    }

    get-transformer() {
        if [ $# -lt 1 ]; then
            echo "need <transformer-name>"
            return
        fi
        transformer_name=$1
        list-documents-in-database Transformers --json | jq -s | jq '.[]|select(.name == "'$transformer_name'")'
    }

    get-transformer-source() {
        get-transformer $1 | jq -r '.sourceCode'
    }

    run-and-store-transform() {
        case $1 in
            --created-at)
                shift
                created_at_string="?createdAt=$1"
                shift
                ;;

            *)
                created_at_string=
                ;;
        esac

        if [ $# -lt 2 ]; then
            echo "need [--created-at time] <data-hash> <transformer-name>"
            return
        fi
        hash=$1
        transformer=$2
        curl $CURL_BASIC_AUTH -s -H 'Content-Type: application/json' "$SERVER_ENDPOINT/transformAndStorePayload/$hash$created_at_string" -d '{"transformerName": "'$transformer'"}'
    }

    apply-transform() {
        hash=$1
        list-documents-in-database SchemaTaggedPayloads --json |
            jq -s |
            jq '.[]|select(.dataChecksum == "sha256:$hash")'
        if [ $# -lt 1 ]; then
            echo 'requires:  <path-to-file>'
            return
        fi

        while [ $# -gt 0 ]; do
            echo $1
            case $1 in
                input*=*)
                    inputsarg="-F inputSchemas=$(echo $1 | cut -d= -f2)"
                    ;;

                output*=*)
                    outputarg="-F outputSchema=$(echo $1 | cut -d= -f2)"
                    ;;

                *)
                    if [ ! -e $1 ]; then
                        echo "ERROR: no file found at $1"
                        return
                    fi
                    source_file=$1
                    ;;
            esac
            shift
        done
        curl $CURL_BASIC_AUTH -vvv $inputsarg $outputarg -F "file=@$source_file" $SERVER_ENDPOINT/$TRANSFORMERS_TABLE_NAME
    }

    # web stuff
    web-start-front() {
      parcel app/index.html
    }
    web-start-back() {
      ts-node app/webserver.ts
    }

  '' + ''
    # sqlite backend
    _query-sqlite() {
        if [ $# -ne 2 ]; then
            echo "need <path-to-database> <query>"
        fi
        sqlite_database_path=$1
        query=$2
        if [ ! -e $sqlite_database_path ]; then
            echo "need path to sqlite database"
            return
        fi
        sqlite3 $sqlite_database_path "$query"
    }

    list-sqlite-schemas() {  # sqlite backend only for now
        _query-sqlite $1 "SELECT json_extract(root.json, '$.title') FROM 'json-schemas' AS root"
    }

    list-sqlite-transformers() {  # sqlite backend only for now
        _query-sqlite $1 "SELECT json FROM 'transformers'" | jq -r '.|[.name, (.supportedInputSchemas | join(",")) + " --> " + .outputSchema] | @tsv'
    }

    list-sqlite-documents-with-schema() {  # sqlite backend only for now
        if [ $# -ne 2 ]; then
            echo "need <path-to-database> <schema-name>"
        fi
        schema_name=$2
        _query-sqlite $1 "SELECT json FROM 'schema-tagged-payloads' AS root WHERE json_extract(root.json, '$.schemaName') = '$schema_name'"
    }
  '' + ''
    # couchdb
    setup-couchdb-sample-init() {
        COUCHDB_BASE_DIR=''${1-$PWD/couchdb}
        if [ ! -e $COUCHDB_BASE_DIR ]; then
            echo "INFO: creating couchdb working directory: $COUCHDB_BASE_DIR"
            mkdir -p $COUCHDB_BASE_DIR
        fi
        
        crudini --set local.ini couchdb single_node true
        crudini --set local.ini couchdb database_dir $COUCHDB_BASE_DIR/data
        crudini --set local.ini couchdb view_index_dir $COUCHDB_BASE_DIR/index
        crudini --set local.ini admins $COUCHDB_AUTH_USERNAME $COUCHDB_AUTH_PASSWORD
    }

    alias start-couchdb='couchdb -couch_ini $PWD/local.ini'
  '' + ''
    echo-shortcuts ${__curPos.file}
  '';
}
