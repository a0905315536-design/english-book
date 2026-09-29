'use strict';
const fs=require('node:fs');
const zlib=require('node:zlib');
const path=require('node:path');
const target=path.join(__dirname,'ecdict.sqlite');
if(fs.existsSync(target))process.exit(0);
const parts=fs.readdirSync(__dirname).filter(name=>/^ecdict\.sqlite\.gz\.part\d+$/.test(name)).sort();
if(!parts.length)throw Error('找不到壓縮字典檔');
const temp=target+'.tmp';
try{
 const compressed=Buffer.concat(parts.map(name=>fs.readFileSync(path.join(__dirname,name))));
 fs.writeFileSync(temp,zlib.gunzipSync(compressed));
 fs.renameSync(temp,target);
}catch(error){try{fs.rmSync(temp,{force:true});}catch{}throw error;}
