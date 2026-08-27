import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

import { dereference } from '@apidevtools/json-schema-ref-parser';
import { jsonSchemaToZod } from 'json-schema-to-zod';

const contracts = [
  {
    file: 'message_block.json',
    output: 'message-block.schema.ts',
    schema: 'messageBlockGeneratedSchema',
    type: 'MessageBlock',
  },
  {
    file: 'a2_u_i_component.json',
    output: 'a2ui-component.schema.ts',
    schema: 'a2uiComponentGeneratedSchema',
    type: 'A2UIComponent',
  },
];

function parseArgs(argv) {
  const args = { in: undefined, out: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--in') args.in = argv[(index += 1)];
    else if (argument === '--out') args.out = argv[(index += 1)];
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!args.in || !args.out) throw new Error('Both --in and --out are required.');
  return { in: resolve(args.in), out: resolve(args.out) };
}

function messageBlockTypes(schema) {
  if (!Array.isArray(schema.oneOf) || typeof schema.$defs !== 'object' || schema.$defs === null) {
    throw new Error('message_block.json must expose oneOf references and $defs.');
  }
  return schema.oneOf.map((entry) => {
    const reference = entry.$ref;
    if (typeof reference !== 'string' || !reference.startsWith('#/$defs/')) {
      throw new Error('Every message block variant must be a local $defs reference.');
    }
    const definition = schema.$defs[reference.slice('#/$defs/'.length)];
    const discriminator = definition?.properties?.type?.const;
    if (typeof discriminator !== 'string') {
      throw new Error(`Message block variant ${reference} has no string type discriminator.`);
    }
    return discriminator;
  });
}

function source(contract, expression, parsed) {
  const typeVocabulary =
    contract.file === 'message_block.json'
      ? `\nexport const messageBlockTypes = ${JSON.stringify(messageBlockTypes(parsed))} as const;\n`
      : '';
  return `/**
 * Generated from clio-schemas JSON Schema. Do not edit by hand.
 * Source: ${contract.file}
 */
import { z } from 'zod';
import type { ${contract.type} } from './_models.js';

export const ${contract.schema}: z.ZodType<${contract.type}> = ${expression};
${typeVocabulary}
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  mkdirSync(args.out, { recursive: true });

  for (const contract of contracts) {
    const input = join(args.in, contract.file);
    const parsed = JSON.parse(readFileSync(input, 'utf8'));
    const resolved = await dereference(input, parsed);
    const expression = jsonSchemaToZod(resolved, {
      depth: 100,
      module: 'none',
      withoutDescribes: true,
    });
    const output = join(args.out, contract.output);
    writeFileSync(output, source(contract, expression, parsed).replaceAll('\r\n', '\n'), 'utf8');
    process.stdout.write(`wrote ${basename(output)}\n`);
  }

  const barrel = join(args.out, 'index.ts');
  const existing = readFileSync(barrel, 'utf8').trimEnd();
  writeFileSync(
    barrel,
    `${existing}\nexport * from './message-block.schema.js';\nexport * from './a2ui-component.schema.js';\n`,
    'utf8',
  );

  for (const entry of readdirSync(args.out, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
    const output = join(args.out, entry.name);
    const generated = readFileSync(output, 'utf8').replace(/^\/\* eslint-disable \*\/\r?\n/u, '');
    writeFileSync(output, generated, 'utf8');
  }
}

await main();
