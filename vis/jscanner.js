var jscanner = (function() {
	var jscanner = {};
	var jdict = {}
	// This dict will hold all the related links for a given id
	var links_by_id = {}

	jscanner.init = function(rawjson){
		rawjson.forEach(function(d){ 
			jdict[d.id] = d
			d["link"].forEach(function(link){
				if( link.target in links_by_id ){
					if( $.inArray(d,links_by_id[link.target]) === -1 ){
						links_by_id[link.target].push(d)
					} 
				}
				else{
					links_by_id[link.target] = [];
					links_by_id[link.target].push(d)
				}
			})
		});
	}


	jscanner.contains = function(id){
		if(id in jdict) return true;
		else return false;
	}

	jscanner.by_id = function(id){
		var json = []

		if(id in jdict){
			var parent = [jdict[id]];
			var children = links_by_id[id];
			if (typeof children != 'undefined'){
				json = parent.concat(children)
			}
			else{
				json = parent;
			}
		}
		return json;
	}
	
	jscanner.by_keyword = function(word){
		var json = []
		// Case insensitive full words only
		var regexp = new RegExp("\\b"+word+"\\b","gi");
		// Scan through each entry
		for (var key in jdict){
			// If word is contained in title, subtitle, or description
			if( regexp.test(jdict[key].title) || regexp.test(jdict[key].subtitle) || regexp.test(jdict[key].description)){
				json.push(jdict[key]);
			}

			// Check for names
			else {
				var rep = jdict[key].people["reporter"];
            	var ass = jdict[key].people["assignee"];
            	if(!$.isEmptyObject(rep) ){
	            	if (regexp.test(rep.displayName) ||
	            		regexp.test(rep.emailAddress)||
	            		regexp.test(rep.name) )
	            	{
	            		json.push(jdict[key]);
	            		continue;
	            	}
	            }
				else if(!$.isEmptyObject(ass) ){
	            	if (regexp.test(ass.displayName) ||
	            		regexp.test(ass.emailAddress)||
	            		regexp.test(ass.name) )
	            	{
	            		json.push(jdict[key]);
	            		continue;
	            	}
    			}
    		}
    	}
		return json;
	}

	return jscanner;

})();