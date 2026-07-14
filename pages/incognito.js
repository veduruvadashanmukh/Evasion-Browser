const form=document.getElementById("searchForm"),input=document.getElementById("searchInput");
function destination(value){value=String(value||"").trim();if(!value)return null;if(/^https?:\/\//i.test(value))return value;if(value.includes(".")&&!value.includes(" "))return `https://${value}`;return `https://duckduckgo.com/?q=${encodeURIComponent(value)}`}
form.addEventListener("submit",event=>{event.preventDefault();const url=destination(input.value);if(url)location.href=url});
