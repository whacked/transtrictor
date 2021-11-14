{
  '$id': 'https://example.com/extended-person.schema.json',
  '$schema': 'https://json-schema.org/draft/2020-12/schema',
  title: 'Person',
  type: 'object',
  properties: {
    firstName: {
      type: 'string',
      description: "The person's first name.",
    },
    lastName: {
      type: 'string',
      description: "The person's last name.",
    },
    displayName: {
      type: 'string',
      description: 'How to display the name',
      default: 'a nanny mouse',
    },
    age: {
      description: 'Age in years which must be equal to or greater than zero.',
      type: 'integer',
      minimum: 0,
    },

    config: {
      type: 'object',
      description: 'extended stuff',
      properties: {
        colors: {
          type: 'array',
          items: {
            type: 'number',
          },
        },
        favorites: {
          type: 'object',
          properties: {
            fruits: {
              type: 'array',
              items: {
                type: 'string',
              },
              default: ['apple', 'banana', 'cherry'],
            },
            day: {
              type: 'string',
              default: 'Monday',
            },
          },
        },
        isSecretAgent: {
          type: ['null', 'boolean'],
          default: true,
        },
        isFromOuterSpace: {
          type: 'boolean',
        },
        isMagician: {
          type: ['null', 'boolean'],
          default: null,
        },
      },
    },
  },
}
