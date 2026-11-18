// Document preparation is deliberately outside the paired drawing tool scope.
export function normalizeG2DocumentRequest(input) {
  const {requestId, width, height, units, ppi=300, orientation}=input??{};
  const keys=['requestId','width','height','units','ppi','orientation'];
  if (!input || typeof input!=='object' || Array.isArray(input)
      || !Object.keys(input).every(key=>keys.includes(key))
      || typeof requestId!=='string' || !/^[A-Za-z0-9_-]{1,80}$/.test(requestId)
      || !['px','mm','cm','in'].includes(units)
      || !Number.isFinite(width) || !Number.isFinite(height)
      || width<=0 || height<=0 || !Number.isInteger(ppi) || ppi<36 || ppi>2400
      || (units==='px' && (!Number.isInteger(width)||!Number.isInteger(height))))
    return null;
  const scale={px:25.4/ppi,mm:1,cm:10,in:25.4}[units];
  if ([width,height].some(value=>value*scale<10 || value*scale>5000))return null;
  const direction=width>height?'landscape':'portrait';
  if (orientation!==undefined && orientation!==direction && !(width===height && orientation==='landscape'))return null;
  return {requestId,width,height,units,ppi,orientation:orientation??direction};
}
