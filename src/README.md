# jsvg: a json(net) generator with validation

## usage

```sh
jsvg <path to json(net) file with json schema definition> <json(net) file>
```

```sh
cat <some json(net) source> | jsvg <path to json(net) file with json schema definition>
```

1. if the json schema definition file contains items with `default`, those will be used as seed values for the output; thus, `cat '{}' | jsvg my.schema.jsonnet` will output all defaults (assume the schema has them specified)
  - values without defaults get outputted as `null`
2. the values from the json(net) source will take precendence / override the defaults
3. the final output is validated against the source schema definition
  - if successful, the final json output is sent to STDOUT
  - if any validation errors are found, they are printed to STDERR, and nothing is sent to STDOUT


# typescript library

  see `jsvg-lib.ts`

## testing

```
jest
```
