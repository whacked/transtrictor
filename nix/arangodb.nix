{ pkgs ? import <nixpkgs> {} }:
pkgs.mkShell {
  buildInputs = [
    pkgs.arangodb
    pkgs.crudini
  ];  # join lists with ++

  nativeBuildInputs = [
    ~/setup/bash/nix_shortcuts.sh
  ];

  shellHook = ''
    # the conf file *SHOULD* be placed in "arangod.conf" in the same directory where arango-secure-installation is run!
    # while arangod takes a --configuration flag, arango-secure-installation is a symlink to arangod,
    # and it does NOT obey the --configuration flag. If you send that flag, it falls back to behaving like vanilla arangod.
    # the conf override is necessary because by default, arangod tries to log to the location set by the nix package,
    # which exists in the nix store and is read-only
    _ARANGO_CONFIG_FILE=arangod.conf
    export ICU_DATA=./arango-data

    setup-arangodb() {
        mkdir -p $ICU_DATA

        if [ ! -e $ICU_DATA/icudtl.dat ]; then
            cp ${pkgs.arangodb}/share/arangodb3/icudtl.dat $ICU_DATA/
        fi

        # to get all the config options, run `arangod --help`
        # and change sections to [section-name] and the sub-options to non-namespaced keyvals.
        # for example:
        # Section 'log' (Configure the logging)
        #   --log.level <string...>
        # becomes:
        # [log]
        # level = info

        # these options are the minimum requirement to get arangod to start
        crudini --set $_ARANGO_CONFIG_FILE database directory $ICU_DATA
        crudini --set $_ARANGO_CONFIG_FILE javascript app-path ./app
        crudini --set $_ARANGO_CONFIG_FILE javascript startup-directory ${pkgs.arangodb}/share/arangodb3/js
        crudini --set $_ARANGO_CONFIG_FILE log file $ICU_DATA/arangod.log
        crudini --set $_ARANGO_CONFIG_FILE server endpoint tcp://127.0.0.1:8529
        # this one looks like good practice
        crudini --set $_ARANGO_CONFIG_FILE server authentication true

        if [ -e .env ]; then
            . .env
        elif [ "x$ARANGODB_AUTH_PASSWORD" != "x" ]; then
            :
        else
            _ARANGODB_AUTH_PASSWORD_CONFIRM=x
            while [ "$ARANGODB_AUTH_PASSWORD" != "$_ARANGODB_AUTH_PASSWORD_CONFIRM" ]; do
                if [ "x$ARANGODB_AUTH_PASSWORD" != "x" ]; then
                    echo "ERROR: passwords don't match $ARANGODB_AUTH_PASSWORD"
                fi
                read -sp "password: " ARANGODB_AUTH_PASSWORD
                echo
                read -sp "confirm password: " _ARANGODB_AUTH_PASSWORD_CONFIRM
                echo
            done
        fi
        echo -e "$ARANGODB_AUTH_PASSWORD\n$ARANGODB_AUTH_PASSWORD" | arango-secure-installation
    }
    alias start-arangodb="arangod --configuration $_ARANGO_CONFIG_FILE"
    echo-shortcuts ${__curPos.file}
  '';  # join strings with +
}
