{ pkgs ? import <nixpkgs> {} }:
pkgs.mkShell {
  buildInputs = [
    pkgs.gnumake
    pkgs.go
    pkgs.jsonnet
    pkgs.yarn
  ];

  shellHook = ''
    export PATH=$(yarn bin):$PATH
  '';
}
