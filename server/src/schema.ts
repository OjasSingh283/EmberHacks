export const notesSchema = {
  type: "object",
  properties: {
    title: {
      type: "string",
    },
    pages: {
      type: "array",
      items: {
        type: "object",
        properties: {
          page: {
            type: "integer",
          },
          latex: {
            type: "string",
          },
          uncertainty: {
            type: "string",
          },
        },
        required: ["page", "latex"],
      },
    },
  },
  required: ["pages"],
};

export const deskDuckSchema = {
  type: "object",
  properties: {
    errors: {
      type: "array",
      items: {
        type: "object",
        properties: {
          box_2d: {
            type: "array",
            items: {
              type: "integer",
            },
            minItems: 4,
            maxItems: 4,
          },
          label: {
            type: "string",
          },
          explanation: {
            type: "string",
          },
        },
        required: ["box_2d", "label", "explanation"],
      },
    },
  },
  required: ["errors"],
};