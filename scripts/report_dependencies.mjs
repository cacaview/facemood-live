import {readFile,writeFile,readdir} from 'node:fs/promises';
const packages=[];
for(const name of await readdir('node_modules')){
 if(name.startsWith('.'))continue;
 const paths=name.startsWith('@')?(await readdir(`node_modules/${name}`)).map(n=>`node_modules/${name}/${n}/package.json`):[`node_modules/${name}/package.json`];
 for(const path of paths){try{const j=JSON.parse(await readFile(path,'utf8'));packages.push({name:j.name,version:j.version,license:j.license||'NOT DECLARED — REVIEW',repository:j.repository});}catch{}}
}
await writeFile('reports/dependency_licenses.json',JSON.stringify(packages,null,2));
console.log(`${packages.length} installed root package license declarations; npm-dependencies.json records complete nested tree.`);
