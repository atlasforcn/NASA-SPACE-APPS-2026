importScripts('core.js','skyline.js');
let cache=new Map();
self.onmessage=async({data})=>{const {id,dem,observation,bounds,options={}}=data;try{MarsCore.setDEM(dem);const result=await Skyline.search(observation,bounds,{...options,cache,onProgress:value=>postMessage({id,type:'progress',value})});if(dem.schema==='mars-region-grid-v1'){if(result.status==='good')result.status='uncertain';result.reason='全球 MOLA 約 3.7 km 來源尚未校準定位可信度；只顯示實驗候選，不自動校正';}postMessage({id,type:'result',result});}catch(error){postMessage({id,type:'error',message:error.message});}};
