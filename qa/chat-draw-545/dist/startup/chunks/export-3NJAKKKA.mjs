import"./chunk-342G2AIU.mjs";var encoder=new TextEncoder;var ascii=value=>encoder.encode(String(value));function concatBytes(parts){const size=parts.reduce((sum,part)=>sum+part.length,0);const out=new Uint8Array(size);let offset=0;for(const part of parts){out.set(part,offset);offset+=part.length}return out}function objectBytes(index,bodyParts){return concatBytes([ascii(`${index} 0 obj
`),...bodyParts,ascii("\nendobj\n")])}function buildSinglePageJpegPdf({jpegBytes,pixelWidth,pixelHeight,widthMm,heightMm,title="INK Artwork"}){const image=jpegBytes instanceof Uint8Array?jpegBytes:new Uint8Array(jpegBytes||[]);if(!image.length)throw new Error("PDF \u9700\u8981\u6709\u6548 JPEG \u8CC7\u6599");const width=Math.max(1,Math.round(Number(pixelWidth)||1));const height=Math.max(1,Math.round(Number(pixelHeight)||1));const widthPt=Number(widthMm)*72/25.4;const heightPt=Number(heightMm)*72/25.4;if(!Number.isFinite(widthPt)||!Number.isFinite(heightPt)||widthPt<=0||heightPt<=0)throw new Error("PDF \u5BE6\u9AD4\u5C3A\u5BF8\u7121\u6548");const safeTitle=String(title||"INK Artwork").replace(/[()\\]/g,value=>`\\${value}`);const content=`q
${widthPt.toFixed(4)} 0 0 ${heightPt.toFixed(4)} 0 0 cm
/Im0 Do
Q`;const objects=[objectBytes(1,[ascii("<< /Type /Catalog /Pages 2 0 R >>")]),objectBytes(2,[ascii("<< /Type /Pages /Kids [3 0 R] /Count 1 >>")]),objectBytes(3,[ascii(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${widthPt.toFixed(4)} ${heightPt.toFixed(4)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`)]),objectBytes(4,[ascii(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>
stream
`),image,ascii("\nendstream")]),objectBytes(5,[ascii(`<< /Length ${ascii(content).length} >>
stream
${content}
endstream`)]),objectBytes(6,[ascii(`<< /Title (${safeTitle}) /Producer (INK) >>`)])];const header=concatBytes([ascii("%PDF-1.4\n%"),new Uint8Array([226,227,207,211]),ascii("\n")]);const offsets=[0];let cursor=header.length;for(const object of objects){offsets.push(cursor);cursor+=object.length}const xrefOffset=cursor;const xref=[`xref
0 ${objects.length+1}
`,"0000000000 65535 f \n"];for(let index=1;index<=objects.length;index++)xref.push(`${String(offsets[index]).padStart(10,"0")} 00000 n 
`);const trailer=`trailer
<< /Size ${objects.length+1} /Root 1 0 R /Info 6 0 R >>
startxref
${xrefOffset}
%%EOF`;return concatBytes([header,...objects,ascii(xref.join("")),ascii(trailer)])}async function canvasToJpegBytes(canvas,quality=.96){const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error("JPEG \u5EFA\u7ACB\u5931\u6557")),"image/jpeg",quality));return new Uint8Array(await blob.arrayBuffer())}async function canvasToPdfBlob(canvas,{widthMm,heightMm,title="INK Artwork",quality=.96}={}){const jpegBytes=await canvasToJpegBytes(canvas,quality);const bytes=buildSinglePageJpegPdf({jpegBytes,pixelWidth:canvas.width,pixelHeight:canvas.height,widthMm,heightMm,title});return new Blob([bytes],{type:"application/pdf"})}export{buildSinglePageJpegPdf,canvasToJpegBytes,canvasToPdfBlob};
