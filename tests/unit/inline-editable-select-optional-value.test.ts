import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// InlineEditableSelect is bound to react-hook-form fields that are OPTIONAL
// (Department, Warehouse — "Warehouse (Optional)" in the UI). For an unset
// optional field, field.value is `undefined`, so a `value: string` prop makes
// every such call site a type error:
//
//   Type 'string | undefined' is not assignable to type 'string'
//
// (4 occurrences across add-product and edit-product inventory tabs.)
//
// `undefined` is also the correct runtime value to pass: Radix Select reads it
// as "no selection" and renders the placeholder. The prop type should admit it
// rather than each call site papering over it with `?? ''`, which would mean
// "selected the empty string" instead of "nothing selected".

const componentSource = fs.readFileSync(
  path.join(__dirname, '../../app/(app)/products/components/inline-editable-select.tsx'),
  'utf-8'
);

const valuePropDecl = componentSource.match(/^\s*value\s*:\s*([^;]+);/m);
assert.ok(valuePropDecl, 'InlineEditableSelect props declare a `value`');

assert.match(
  valuePropDecl![1].trim(),
  /string\s*\|\s*undefined|undefined\s*\|\s*string/,
  'InlineEditableSelect `value` prop admits undefined, so optional form ' +
    'fields (Department, Warehouse) type-check without coercing an unset ' +
    'field to the empty string'
);

// The component must not then coerce undefined away before handing it to
// Radix — `value={value ?? ''}` would reintroduce the "empty string is a
// selection" bug the existing onValueChange guard already defends against.
assert.match(
  componentSource,
  /value=\{value\}/,
  'the undefined value is passed through to Select unchanged (no ?? "" coercion)'
);

console.log('✓ inline-editable-select-optional-value');
