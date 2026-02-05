// URL module polyfill
// https://www.npmjs.com/package/url-shim
// dist/url-shim.js v1.0.1

function toErr(msg, code, err) {
	err = new TypeError(msg);
	err.code = code;
	throw err;
}

function invalid(str) {
	toErr('Invalid URL: ' + str, 'ERR_INVALID_URL');
}

function args(both, len, x, y) {
	x = 'The "name" ';
	y = 'argument';

	if (both) {
		x += 'and "value" ';
		y += 's';
	}

	if (len < ++both) {
		toErr(x + y + ' must be specified', 'ERR_MISSING_ARGS');
	}
}

function toIter(arr, supported) {
	var val, j=0, iter = {
		next: function () {
			val = arr[j++];
			return {
				value: val,
				done: j > arr.length
			}
		}
	};

	if (supported) {
		iter[Symbol.iterator] = function () {
			return iter;
		};
	}

	return iter;
}

function URLSearchParams(init, ref) {
	var k, i, x, supp, tmp, $=this, list=[];

	try {
		supp = !!Symbol.iterator;
	} catch (e) {
		supp = false;
	}

	if (init) {
		if (!!init.keys && !!init.getAll) {
			init.forEach(function (v, k) {
				toAppend(k, v);
			});
		} else if (!!init.pop) {
			for (i=0; i < init.length; i++) {
				toAppend.apply(0, init[i]);
			}
		} else if (typeof init == 'object') {
			for (k in init) toSet(k, init[k]);
		} else if (typeof init == 'string') {
			if (init[0] == '?') init = init.substring(1);
			x = decodeURIComponent(init).split('&');
			while (k = x.shift()) {
				i = k.indexOf('=');
				if (!~i) i = k.length;
				toAppend(
					k.substring(0, i),
					k.substring(++i)
				);
			}
		}
	}

	function toSet(key, val) {
		args(1, arguments.length);
		val = String(val);
		x = false; // found?
		for (i=list.length; i--;) {
			tmp = list[i];
			if (tmp[0] == key) {
				if (x) {
					list.splice(i, 1);
				} else {
					tmp[1] = val;
					x = true;
				}
			}
		}
		x || list.push([key, val]);
		cascade();
	}

	function toAppend(key, val) {
		args(1, arguments.length);
		list.push([key, String(val)]);
		cascade();
	}

	function toStr() {
		tmp = '';
		for (i=0; i < list.length; i++) {
			if (tmp) tmp += '&';
			tmp += encodeURIComponent(list[i][0]) + '=' + encodeURIComponent(list[i][1]);
		}
		return tmp.replace(/%20/g, '+');
	}

	function cascade() {
		if (ref) {
			var searchStr = list.length ? ('?' + toStr().replace(/=$/, '')) : '';
			if (ref.updateSearch) {
				ref.updateSearch(searchStr);
			} else {
				ref.search = searchStr;
			}
		}
	}

	$.append = toAppend;
	$.delete = function (key) {
		args(0, arguments.length);
		for (i=list.length; i--;) {
			if (list[i][0] == key) list.splice(i, 1);
		}
		cascade();
	};
	$.entries = function () {
		return toIter(list, supp);
	};
	$.forEach = function (fn) {
		if (typeof fn != 'function') {
			toErr('Callback must be a function', 'ERR_INVALID_CALLBACK');
		}
		for (i=0; i < list.length; i++) {
			fn(list[i][1], list[i][0]); // (val,key)
		}
	};
	$.get = function (key) {
		args(0, arguments.length);
		for (i=0; i < list.length; i++) {
			if (list[i][0] == key) return list[i][1];
		}
		return null;
	};
	$.getAll = function (key) {
		args(0, arguments.length);
		tmp = [];
		for (i=0; i < list.length; i++) {
			if (list[i][0] == key) {
				tmp.push(list[i][1]);
			}
		}
		return tmp;
	};
	$.has = function (key) {
		args(0, arguments.length);
		for (i=0; i < list.length; i++) {
			if (list[i][0] == key) return true;
		}
		return false;
	};
	$.keys = function () {
		tmp = [];
		for (i=0; i < list.length; i++) {
			tmp.push(list[i][0]);
		}
		return toIter(tmp, supp);
	},
	$.set = toSet;
	$.sort = function () {
		x = []; tmp = [];
		for (i=0; i < list.length; x.push(list[i++][0]));
		for (x.sort(); k = x.shift();) {
			for (i=0; i < list.length; i++) {
				if (list[i][0] == k) {
					tmp.push(list.splice(i, 1).shift());
					break;
				}
			}
		}
		list = tmp;
		cascade();
	};
	$.toString = toStr;
	$.values = function () {
		tmp = [];
		for (i=0; i < list.length; i++) {
			tmp.push(list[i][1]);
		}
		return toIter(tmp, supp);
	};

	if (supp) {
		$[Symbol.iterator] = $.entries;
	}

	return $;
}

function URL(url, base) {
	var segs, usp, $=this, rgx=/(blob|ftp|wss?|https?):/;
	var parsed = {};

	base = String(base || '').trim();
	url = String(url).trim();

	// Parse base URL if provided
	var baseParsed = base ? parseURL(base) : null;
	if (base && !baseParsed) return invalid(base);

	// Parse the URL
	var urlParsed = parseURL(url);
	
	if (urlParsed) {
		// Absolute URL
		parsed = urlParsed;
	} else if (baseParsed) {
		// Relative URL with base
		parsed = resolveURL(url, baseParsed);
	} else {
		return invalid(url);
	}

	// URL parsing regex
	function parseURL(str) {
		if (!str) return null;
		
		// Full URL regex: protocol://[username:password@]hostname[:port][/path][?search][#hash]
		var match = str.match(/^([a-z][a-z0-9+.-]*):\/\/(?:([^:@]+)(?::([^@]+))?@)?([^:/?#]+)(?::(\d+))?([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/i);
		
		if (!match) {
			// Try protocol-relative URL: //hostname[:port][/path][?search][#hash]
			match = str.match(/^\/\/(?:([^:@]+)(?::([^@]+))?@)?([^:/?#]+)(?::(\d+))?([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/i);
			if (match) {
				return {
					protocol: '',
					username: match[1] || '',
					password: match[2] || '',
					hostname: match[3],
					port: match[4] || '',
					pathname: match[5] || '/',
					search: match[6] ? '?' + match[6] : '',
					hash: match[7] ? '#' + match[7] : ''
				};
			}
			return null;
		}
		
		return {
			protocol: match[1].toLowerCase() + ':',
			username: match[2] || '',
			password: match[3] || '',
			hostname: match[4].toLowerCase(),
			port: match[5] || '',
			pathname: match[6] || '/',
			search: match[7] ? '?' + match[7] : '',
			hash: match[8] ? '#' + match[8] : ''
		};
	}

	function resolveURL(relativeUrl, baseUrl) {
		if (!relativeUrl) return baseUrl;
		
		// Handle different types of relative URLs
		if (relativeUrl.startsWith('//')) {
			// Protocol-relative
			return parseURL(baseUrl.protocol + relativeUrl);
		} else if (relativeUrl.startsWith('/')) {
			// Root-relative
			var result = Object.assign({}, baseUrl);
			var match = relativeUrl.match(/^([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/);
			result.pathname = match[1];
			result.search = match[2] ? '?' + match[2] : '';
			result.hash = match[3] ? '#' + match[3] : '';
			return result;
		} else if (relativeUrl.match(/^[?#]/)) {
			// Query or fragment only
			var result = Object.assign({}, baseUrl);
			if (relativeUrl.startsWith('?')) {
				var match = relativeUrl.match(/^(\?[^#]*)(?:#(.*))?$/);
				result.search = match[1];
				result.hash = match[2] ? '#' + match[2] : '';
			} else {
				result.hash = relativeUrl;
			}
			return result;
		} else {
			// Path-relative
			var result = Object.assign({}, baseUrl);
			var basePath = baseUrl.pathname.split('/').slice(0, -1);
			var relativeParts = relativeUrl.replace(/^(\.\/)?/, '').split('/');
			
			// Handle .. segments
			var i = 0;
			while (i < relativeParts.length) {
				if (relativeParts[i] === '..') {
					basePath.pop();
					relativeParts.splice(i, 1);
				} else {
					i++;
				}
			}
			
			var fullPath = basePath.concat(relativeParts).join('/');
			var match = fullPath.match(/^([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/);
			result.pathname = match[1] || '/';
			result.search = match[2] ? '?' + match[2] : '';
			result.hash = match[3] ? '#' + match[3] : '';
			return result;
		}
	}

	function getHost() {
		return parsed.hostname + (parsed.port ? ':' + parsed.port : '');
	}

	function getOrigin() {
		if (!rgx.test(parsed.protocol)) return 'null';
		return parsed.protocol + '//' + getHost();
	}

	function getHref() {
		var auth = '';
		if (parsed.username || parsed.password) {
			auth = parsed.username + (parsed.password ? ':' + parsed.password : '') + '@';
		}
		return parsed.protocol + '//' + auth + getHost() + parsed.pathname + parsed.search + parsed.hash;
	}

	function setHref(val) {
		var newParsed = parseURL(String(val));
		if (!newParsed) return invalid(val);
		parsed = newParsed;
		usp = new URLSearchParams(parsed.search.slice(1), { 
			search: parsed.search,
			updateSearch: function(newSearch) { 
				parsed.search = newSearch;
			}
		});
	}

	function block(key, readonly, getter, setter) {
		var out = { enumerable: true };
		if (!readonly && setter) {
			out.set = setter;
		} else if (!readonly) {
			out.set = function (val) {
				if (val != null) {
					parsed[key] = String(val);
					if (key === 'search') {
						usp = new URLSearchParams(parsed.search.slice(1), {
							search: parsed.search,
							updateSearch: function(newSearch) { 
								parsed.search = newSearch;
							}
						});
					}
				}
			};
		}
		out.get = getter || function () {
			return parsed[key] || '';
		};
		return out;
	}

	usp = new URLSearchParams(parsed.search.slice(1), {
		search: parsed.search,
		updateSearch: function(newSearch) { 
			parsed.search = newSearch;
		}
	});

	$.toString = $.toJSON = function() {
		return getHref();
	};

	return Object.defineProperties($, {
		href: block('href', false, getHref, setHref),
		protocol: block('protocol'),
		username: block('username'),
		password: block('password'),
		hostname: block('hostname'),
		host: block('host', false, getHost, function(val) {
			var parts = String(val).split(':');
			parsed.hostname = parts[0];
			parsed.port = parts[1] || '';
		}),
		port: block('port'),
		search: block('search'),
		hash: block('hash'),
		pathname: block('pathname'),
		origin: block('origin', true, getOrigin),
		searchParams: block('searchParams', true, function () {
			return usp;
		})
	});
}

exports.URL = URL;
exports.URLSearchParams = URLSearchParams;
exports.parse = function(input, base) {
	return new URL(input, base);
}
exports.format = function(urlObj) {
    // Handle URL object or parsed URL object
    if (urlObj && typeof urlObj.toString === 'function') {
        return urlObj.toString();
    }
    
    // Handle legacy url.parse() format
    var result = '';
    
    if (urlObj.protocol) {
        result += urlObj.protocol;
        if (!result.endsWith('//')) {
            result += '//';
        }
    }
    
    if (urlObj.username) {
        result += urlObj.username;
        if (urlObj.password) {
            result += ':' + urlObj.password;
        }
        result += '@';
    }
    
    if (urlObj.hostname || urlObj.host) {
        result += urlObj.hostname || urlObj.host;
    }
    
    if (urlObj.port) {
        result += ':' + urlObj.port;
    }
    
    if (urlObj.pathname) {
        result += urlObj.pathname;
    }
    
    if (urlObj.search) {
        result += urlObj.search;
    } else if (urlObj.query) {
        result += '?' + urlObj.query;
    }
    
    if (urlObj.hash) {
        result += urlObj.hash;
    }
    
    return result;
}