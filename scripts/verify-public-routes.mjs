const origin=process.argv[2] || 'http://localhost:3001';
for(const [path,heading] of [['/contact','Contact us'],['/reviews','Merchant reviews']]) {
 const response=await fetch(new URL(path,origin));
 const html=await response.text();
 const result={path,status:response.status,heading:html.includes(heading),navigation:html.includes('href="/contact"')&&html.includes('href="/reviews"'),whatsapp:html.includes('wa.me/2348165443398')};
 console.log(JSON.stringify(result));
 if(response.status!==200||!result.heading||!result.navigation||!result.whatsapp)process.exitCode=1;
}
