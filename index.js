const crypto = require("crypto");
const { JSONPath } = require("jsonpath-plus");

const replacementContent = "Will be replaced with HASH of request body";

function generateHash(content, options) {
  if (options.jsonPath) {
    content = JSON.stringify(
      JSONPath({
        path: options.jsonPath,
        json: JSON.parse(content),
        wrap: false,
      })
    );
  }

  if (options.removeWhitespace) {
    content = JSON.stringify(JSON.parse(content));
  }

  if (options.prefix !== null && options.prefix !== undefined) {
    content = options.prefix + content;
  }

  if (options.suffix !== null && options.suffix !== undefined) {
    content = content + options.suffix;
  }

  const hash = crypto
    .createHash(options.algorithm)
    .update(content, "utf8")
    .digest(options.encoding);

  return hash;
}

function replaceWithHash(content, body) {
  return content.replace(
    new RegExp(replacementContent + " \\(([a-f0-9]+)\\)", "g"),
    (match, hex) => {
      const options = JSON.parse(Buffer.from(hex, "hex").toString("utf-8"));
      return generateHash(body, options);
    }
  );
}

module.exports.templateTags = [
  {
    name: "reqbodyhash",
    displayName: "Request Body Hash",
    description: "Hash a value or the request body",
    args: [
      {
        displayName: "Algorithm",
        type: "enum",
        options: [
          { displayName: "MD5", value: "md5" },
          { displayName: "SHA1", value: "sha1" },
          { displayName: "SHA256", value: "sha256" },
          { displayName: "SHA512", value: "sha512" },
        ],
      },
      {
        displayName: "Digest Encoding",
        description: "The encoding of the output",
        type: "enum",
        options: [
          { displayName: "Hexadecimal", value: "hex" },
          { displayName: "Base64", value: "base64" },
        ],
      },
      {
        displayName: "Remove whitespace from JSON",
        description:
          "Parse and stringify JSON request body to remove any whitespace",
        type: "enum",
        options: [
          { displayName: "No", value: false },
          { displayName: "Yes", value: true },
        ],
      },
      {
        displayName: "JSONPath to object that should be hashed",
        description:
          "If hashing is to be done only to a part of the request body select it using a JSONPath query. Note: whitespace will be removed before hashing",
        type: "string",
        placeholder: "JSONPath (leave empty to not use)",
      },
      {
        displayName: "Message",
        type: "string",
        placeholder: "Message to hash (leave empty to use request body)",
      },
      {
        displayName: "Message Prefix",
        type: "string",
        placeholder: "Additional text prepended to message for generating hash",
      },
      {
        displayName: "Message Suffix",
        type: "string",
        placeholder: "Additional text appended to message for generating hash",
      },
    ],
    async run(
      context,
      algorithm,
      encoding,
      removeWhitespace = false,
      jsonPath = "",
      value = "",
      prefix = "",
      suffix = ""
    ) {
      if (encoding !== "hex" && encoding !== "base64") {
        throw new Error(
          `Invalid encoding ${encoding}. Choices are hex, base64`
        );
      }

      const valueType = typeof value;
      if (valueType !== "string") {
        throw new Error(`Cannot hash value of type "${valueType}"`);
      }

      const options = {
        algorithm: algorithm,
        encoding: encoding,
        jsonPath: jsonPath !== "" ? jsonPath : undefined,
        removeWhitespace:
          removeWhitespace === true || removeWhitespace === "true"
            ? true
            : undefined,
        prefix: prefix,
        suffix: suffix,
      };

      if (value === "") {
        return (
          replacementContent +
          " (" +
          Buffer.from(JSON.stringify(options)).toString("hex") +
          ")"
        );
      } else {
        return generateHash(value, options);
      }
    },
  },
];

module.exports.requestHooks = [
  async (context) => {
    const body = context.request.getBody();
    let bodyText = body.text || "";
    if (bodyText.indexOf(replacementContent) !== -1) {
      bodyText = replaceWithHash(bodyText, bodyText);
      context.request.setBody({
        ...body,
        text: bodyText,
      });
    }
    if (context.request.getUrl().indexOf(replacementContent) !== -1) {
      context.request.setUrl(
        replaceWithHash(context.request.getUrl(), bodyText)
      );
    }
    context.request.getHeaders().forEach((h) => {
      if (h.value.indexOf(replacementContent) !== -1) {
        context.request.setHeader(h.name, replaceWithHash(h.value, bodyText));
      }
    });
    context.request.getParameters().forEach((p) => {
      if (p.value.indexOf(replacementContent) !== -1) {
        context.request.setParameter(
          p.name,
          replaceWithHash(p.value, bodyText)
        );
      }
    });
  },
];
