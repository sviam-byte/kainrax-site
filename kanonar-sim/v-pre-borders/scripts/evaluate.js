
export async function evaluateModel(modelId, params, context){
  try{
    const url = new URL(import.meta.url);
    const base = url.pathname.split('/').slice(0,-1).join('/'); // .../scripts
    // models folder is sibling of scripts
    const modelUrl = base.replace('/scripts','/models') + '/' + modelId + '.js';
    const mod = await import(modelUrl);
    if(typeof mod.evaluate !== 'function') throw new Error('evaluate() missing');
    return mod.evaluate(params, {context});
  }catch(e){
    console.error(e);
    return {derived:{}, flags:'warning', warnings:['model-load-failed']};
  }
}
