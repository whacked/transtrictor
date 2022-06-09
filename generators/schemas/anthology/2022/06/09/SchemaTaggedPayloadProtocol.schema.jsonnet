// this schema represents the wrapping "protocol" a la "protocolVersion"

local version = '2022-06-09.1';

(import '../../03/25/SchemaTaggedPayloadProtocol.schema.jsonnet') {
  title: 'SchemaTaggedPayload',
  version: version,
  /**
   * experimental property; not sure if this will pan out
   * pros:
   * - when stored in db, this allows quick lookup of inheritance
   * cons:
   * - works only by discipline and carefully ensuring the name is correct
   * - without looking at code, it's impossible to know how inhertiance works;
   * - if you have the code, you'll have ground truth from the AST
   * conclusion: not convinced this is a good idea, but try and see what happens
   */
  parents: ['SchemaTaggedPayload@2022-03-25.1'],
  properties+: {
    protocolVersion+: {
      description: 'version of the Tagged Payload protocol (this particular protocol is version %s)' % [version],
    },
    parentIds: {
      type: 'array',
      description: 'optional list of identifiers/locators to the source data, if applicable, that generates the current payload',
      items: {
        type: 'string',
      },
      examples: [
        ['sha256:d7946e0aa58456d44fdc86eb25877d9e8008a98c76c073df526a193da293eae1'],
        ['xYzAbc'],
      ],
    },
  },
}
