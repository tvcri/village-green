/**
 * Map one dereferenced OpenAPI parameter object to a control descriptor.
 *
 * Branch order is deliberate:
 *  - array before enum, because an array's enum lives at items.enum
 *  - enum before type, because username-match is type:string AND enum and the
 *    dropdown must win
 *
 * All path params in this spec are type:string with numeric patterns — they are
 * IDs carried as strings. Never coerce them to number; '007' must stay '007'.
 *
 * @param {object} param an OpenAPI parameter object (already dereferenced)
 * @returns {{name: string, in: string, required: boolean, description: string,
 *            default: any, pattern: string|undefined, placeholder: string,
 *            control: string, options?: Array}}
 */
export function toFieldDescriptor(param) {
  const schema = param.schema ?? {}
  const base = {
    name: param.name,
    in: param.in,
    required: !!param.required,
    description: param.description ?? '',
    default: schema.default,
    pattern: schema.pattern,
    placeholder: schema.default !== undefined ? String(schema.default) : '',
  }

  if (schema.type === 'array') {
    return schema.items?.enum
      ? { ...base, control: 'multiselect', options: schema.items.enum }
      : { ...base, control: 'chips' }
  }
  if (schema.enum) return { ...base, control: 'select', options: schema.enum }
  if (schema.type === 'boolean') return { ...base, control: 'tristate' }
  if (schema.type === 'integer' || schema.type === 'number') return { ...base, control: 'number' }
  if (schema.format === 'date') return { ...base, control: 'date' }

  if (import.meta.env?.DEV && schema.type && schema.type !== 'string') {
    // No object/oneOf/allOf params exist in this spec today. If one lands, it
    // silently degrades to a text box — surface it instead of hiding it.
    console.warn(`[ApiBrowser] no control mapping for param "${param.name}" (type ${schema.type}); using text`)
  }
  return { ...base, control: 'text' }
}

/**
 * Build the ordered descriptor list for an operation's params map.
 * Path params first (they're required to build the URL at all), then query.
 *
 * @param {object} params operationMap entry's `params`, keyed by param name
 * @returns {Array<object>}
 */
export function buildDescriptors(params) {
  const descriptors = Object.values(params ?? {}).map(toFieldDescriptor)
  const rank = d => (d.in === 'path' ? 0 : 1)
  return descriptors.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
}
