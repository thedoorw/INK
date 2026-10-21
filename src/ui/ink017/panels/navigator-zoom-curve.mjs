// Navigator UI transfer function only; Native camera remains the zoom authority.
// Core accepts scale 0.03..128, i.e. 3%..12800%.
// The five USER-approved anchor percentages are exact slider positions.
// Interpolate log(zoom) with monotone cubic Hermite segments (PCHIP):
// this avoids abrupt changes of drag sensitivity at each quarter-point.
export const NAVIGATOR_ZOOM_MIN=3;
export const NAVIGATOR_ZOOM_CENTER=100;
export const NAVIGATOR_ZOOM_MAX=12800;
export const NAVIGATOR_SLIDER_MAX=1000;
export const NAVIGATOR_SLIDER_CENTER=500;
export const NAVIGATOR_ZOOM_ANCHORS=Object.freeze([
 Object.freeze({position:0,zoom:3}),
 Object.freeze({position:250,zoom:20}),
 Object.freeze({position:500,zoom:100}),
 Object.freeze({position:750,zoom:1000}),
 Object.freeze({position:1000,zoom:12800})
]);

const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)));
const heights=NAVIGATOR_ZOOM_ANCHORS.map(a=>Math.log(a.zoom));
const rise=heights.slice(1).map((y,i)=>y-heights[i]);
// All intervals have the same slider width (250 steps).
// A weighted harmonic mean gives one shared, monotone slope at each knot.
const slope=new Array(heights.length).fill(0);
const endSlope=(first,second)=>Math.min(3*first,Math.max(0,(3*first-second)/2));
slope[0]=endSlope(rise[0],rise[1]);
for(let i=1;i<NAVIGATOR_ZOOM_ANCHORS.length-1;i++){
 const a=rise[i-1],b=rise[i];
 slope[i]=a*b>0?2*a*b/(a+b):0;
}
slope[NAVIGATOR_ZOOM_ANCHORS.length-1]=endSlope(rise.at(-1),rise.at(-2));

export function navigatorZoomFromPosition(position){
 const p=clamp(position,0,NAVIGATOR_SLIDER_MAX);
 if(!Number.isFinite(p))return NAVIGATOR_ZOOM_CENTER;
 const anchors=NAVIGATOR_ZOOM_ANCHORS;
 for(const a of anchors)if(p===a.position)return a.zoom;
 const index=Math.min(anchors.length-2,Math.floor(p/250));
 const t=(p-anchors[index].position)/250,t2=t*t,t3=t2*t;
 const logZoom=(2*t3-3*t2+1)*heights[index]
  +(t3-2*t2+t)*slope[index]
  +(-2*t3+3*t2)*heights[index+1]
  +(t3-t2)*slope[index+1];
 return Math.exp(logZoom);
}

export function navigatorPositionFromZoom(zoom){
 const z=clamp(zoom,NAVIGATOR_ZOOM_MIN,NAVIGATOR_ZOOM_MAX);
 if(!Number.isFinite(z))return NAVIGATOR_SLIDER_CENTER;
 for(const a of NAVIGATOR_ZOOM_ANCHORS)if(z===a.zoom)return a.position;
 let left=0,right=NAVIGATOR_SLIDER_MAX;
 // Numeric inverse of the same smooth function: no second zoom model.
 for(let i=0;i<40;i++){
  const middle=(left+right)/2;
  if(navigatorZoomFromPosition(middle)<z)left=middle;
  else right=middle;
 }
 return Math.round((left+right)/2);
}

export const navigatorZoomText=value=>String(Math.round(Number(value)*100)/100);
