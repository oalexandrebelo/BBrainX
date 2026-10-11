/**
 * Adapter explícito para schemas Zod com refinamentos/transforms assíncronos.
 * O motor permanece Standard Schema; não procura APIs internas nem altera o objeto Zod.
 * safeParseAsync evita a sondagem síncrona de ~standard.validate, que pode iniciar um
 * refinamento assíncrono duas vezes e abandonar a primeira promessa em versões examinadas.
 */
export function asyncZodSchema(schema) {
  const standard=schema?.['~standard'], json=standard?.jsonSchema;
  if(standard?.version!==1||standard.vendor!=='zod'||typeof schema.safeParseAsync!=='function'||
    typeof json?.input!=='function'||typeof json?.output!=='function') {
    throw new TypeError('ZOD_ASYNC_SCHEMA_REQUIRED');
  }
  const parse=schema.safeParseAsync.bind(schema);
  return Object.freeze({'~standard':Object.freeze({
    version:1,vendor:'bbrainx-zod-async',
    jsonSchema:Object.freeze({input:json.input.bind(json),output:json.output.bind(json)}),
    async validate(value){
      const result=await parse(value);
      if(result?.success===true)return {value:result.data};
      if(result?.success===false&&Array.isArray(result.error?.issues))return {issues:result.error.issues};
      throw new TypeError('INVALID_ZOD_PARSE_RESULT');
    }
  })});
}
