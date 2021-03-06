var _ = require( "lodash" );
var url = require( "./urlTemplate.js" );
var pluralize = require( "pluralize" );

function applyVersion( resource, version ) {
	var target = _.cloneDeep( resource );
	version = version || 1;
	if ( resource.versions && version > 1 ) {
		var changes = _.filter( resource.versions, function( x, v ) {
			return v <= version;
		} );
		_.each( changes, function( change ) {
			deepMerge( target.actions, change );
		} );
	}
	target.actions = _.omit( target.actions, function( x ) {
		return x.deleted;
	} );
	return target;
}

function buildParametersFn( action ) {
	// get static parameters
	var parameters = _.reduce(
		_.omit( action.parameters, function( v ) {
			return _.isFunction( v );
		} ), function( acc, v, k ) {
			acc[ k ] = v;
			return acc;
		},
		{}
	);

	// get dynamic parameters
	var generators = _.omit( action.parameters, function( v ) {
		return !_.isFunction( v );
	} );

	// return a function that will add dynamic parameters to the
	// static at render time
	return function getParameters( data, envelope ) {
		return _.reduce( generators, function( acc, fn, key ) {
			var param = fn( envelope, data );
			if ( param ) {
				acc[ key ] = param;
			}
			return acc;
		}, parameters );
	};
}

function deepMerge( target, source ) { // jshint ignore:line
	_.each( source, function( val, key ) {
		var original = target[ key ];
		if ( _.isObject( val ) ) {
			if ( original ) {
				deepMerge( original, val );
			} else {
				target[ key ] = val;
			}
		} else {
			target[ key ] = ( original === undefined ) ? val : original;
		}
	} );
}

function getExclusion( exclude, unit ) {
	return exclude ? function( data ) {
		return _.omit( data, exclude );
	} : unit;
}

function getInclusion( include, unit ) {
	return include ? function( data ) {
		return _.pick( data, include );
	} : unit;
}

function getFilter( filter, unit ) {
	return filter ? function( data ) {
		return _.pick( data, filter );
	} : unit;
}

function getMap( map, unit ) {
	return map ? function( data ) {
		return map( data );
	} : unit;
}

function getPrefix( resources, prefix, resource ) {
	var urlPrefix = prefix ? prefix.urlPrefix : "";
	var apiPrefix = prefix ? prefix.apiPrefix : "";
	var parentPrefix = {};

	if ( resource.parent ) {
		var parentResource = resources[ resource.parent ];
		parentPrefix = getPrefix( resources, prefix, parentResource );
	}

	if ( resource.urlPrefix === undefined ) {
		urlPrefix = parentPrefix.urlPrefix === undefined ? urlPrefix : parentPrefix.urlPrefix;
	} else {
		urlPrefix = resource.urlPrefix;
	}

	if ( resource.apiPrefix === undefined ) {
		apiPrefix = parentPrefix.apiPrefix === undefined ? apiPrefix : parentPrefix.apiPrefix;
	} else {
		apiPrefix = resource.apiPrefix;
	}

	return {
		urlPrefix: urlPrefix,
		apiPrefix: apiPrefix
	};
}

function getActionUrlCache( resources, prefix, version ) {
	var cache = {};
	var parentUrlFn = getParentUrlFn( resources, version );
	var prefixFn = getPrefix.bind( undefined, resources, prefix );

	_.reduce( resources, function( rAcc, resource, resourceName ) {
		resource = getVersion( resource, version );
		rAcc[ resourceName ] = _.reduce( resource.actions, function( acc, action, actionName ) {
			var actionSegment = resource.actions[ actionName ].url;
			var resourceSegment = getResourcePrefix( actionSegment, resource, resourceName );
			var actionUrl = [ resourceSegment, actionSegment ].join( "" ).replace( "//", "/" );
			var templated = isTemplated( actionUrl );
			var getActionUrl = function() {
				return actionUrl;
			};
			if ( templated ) {
				var tokens = url.getTokens( actionUrl );
				var halUrl = url.forHal( actionUrl );
				getActionUrl = function( data ) {
					var clonedTokens = _.clone( tokens );
					return url.process( clonedTokens, halUrl, data, resourceName );
				};
			}

			function getParentUrl( parentUrl, data ) {
				return ( parentUrl || parentUrlFn( resourceName, data ) ) || "";
			}

			var resourcePrefix = prefixFn( resource );

			acc[ actionName ] = function( data, parentUrl ) {
				var href = [
					resourcePrefix.urlPrefix,
					resourcePrefix.apiPrefix,
					getParentUrl( parentUrl, data ),
					getActionUrl( data )
				].join( "" ).replace( "//", "/" );
				return href;
			};

			_.each( action.links, function( link, linkName ) {
				var linkFn = getLinkFn( link, resource, resourceName );
				acc[ linkName ] = function( data, parentUrl, envelope ) {
					var linkUrl = linkFn( data, envelope );
					if ( linkUrl ) {
						var href = [
							resourcePrefix.urlPrefix,
							resourcePrefix.apiPrefix,
							getParentUrl( parentUrl, data ),
							linkFn( data, envelope )
						].join( "" ).replace( "//", "/" );
						return href;
					} else {
						return "";
					}
				};
			} );

			return acc;
		}, {} );
		return rAcc;
	}, cache );

	return cache;
}

function getBodyCache( resources, prefix, version ) {
	var cache = {};
	_.reduce( resources, function( rAcc, resource, resourceName ) {
		resource = getVersion( resource, version );
		rAcc[ resourceName ] = _.reduce( resource.actions, function( acc, action, actionName ) {
			var unit = function( x ) {
				return x;
			};
			var embedded = _.keys( action.embed );
			var include = getInclusion( action.include, unit );
			var exclude = getExclusion( action.exclude, unit );
			if ( action.include ) {
				embedded = _.difference( embedded, include );
			}
			var filter = getFilter( action.filter, unit );
			var map = getMap( action.transform, unit );
			var strip = removeEmbedded( embedded, unit );
			var fn = _.compose( strip, map, filter, exclude, include );
			acc[ actionName ] = function( data ) {
				var cloned = _.cloneDeep( data );
				return fn( cloned );
			};
			return acc;
		}, {} );
		return rAcc;
	}, cache );

	return cache;
}

function getBodyFn( resources, prefix, version ) {
	var renderCache = getBodyCache( resources, prefix, version );
	return function( resourceName, actionName, data ) {
		return renderCache[ resourceName ][ actionName ]( data );
	};
}

function getLinksCache( resources, prefix, version, forOptions, skipAuthCheck ) {
	var cache = {};
	var urlFn = getUrlFn( resources, prefix, version );

	_.reduce( resources, function( rAcc, resource, resourceName ) {
		resource = getVersion( resource, version );
		rAcc[ resourceName ] = _.reduce( resource.actions, function( acc, action, actionName ) {
			var parameterFn = buildParametersFn( action );
			var method = action.method.toUpperCase();
			var render;
			if ( skipAuthCheck ) {
				render = function() {
					return true;
				};
			} else {
				render = shouldRenderFn( action, actionName, resourceName, forOptions );
			}
			acc[ actionName ] = function( envelope, data, parentUrl, auth ) {
				var links = {};
				if ( render( envelope, data, auth ) ) {
					var actionUrl = urlFn( resourceName, actionName, data, parentUrl, envelope );
					var parameters = parameterFn( data, envelope );
					_.each( action.links, function( _link, linkName ) {
						var linkUrl = urlFn( resourceName, linkName, data, parentUrl, envelope );
						if ( linkUrl ) {
							var link = {
								href: linkUrl,
								method: method
							};
							if ( isTemplated( linkUrl ) ) {
								link.templated = true;
							}
							if ( action.parameters ) {
								link.parameters = parameters;
							}
							links[ linkName ] = link;
						}
					} );
					var link = { href: actionUrl, method: method };
					links[ actionName ] = link;
					if ( isTemplated( actionUrl ) ) {
						link.templated = true;
					}
					if ( action.parameters ) {
						link.parameters = parameters;
					}
					return links;
				} else {
					return links;
				}
			};
			return acc;
		}, {} );
		return rAcc;
	}, cache );
	return cache;
}

function getLinksFn( resources, prefix, version, forOptions, skipAuthCheck ) {
	var linkCache = getLinksCache( resources, prefix, version, forOptions, skipAuthCheck );
	return function( resourceName, actionName, envelope, data, parentUrl, auth ) {
		auth = auth || function() {
			return true;
		};
		return linkCache[ resourceName ][ actionName ]( envelope, data, parentUrl, auth );
	};
}

function getLinkFn( link, resource, resourceName ) { // jshint ignore:line
	if ( _.isFunction( link ) ) {
		return function( data, envelope ) {
			var linkUrl = link( envelope, data );
			if ( linkUrl ) {
				linkUrl = linkUrl.replace( "//", "/" );
				return isTemplated( linkUrl ) ?
					url.create( linkUrl, data, resourceName ) :
					linkUrl;
			} else {
				return undefined;
			}
		};
	} else {
		var halUrl = url.forHal( link.replace( "//", "/" ) );
		var templated = isTemplated( halUrl );
		if ( templated ) {
			var tokens = url.getTokens( halUrl );
			return function( data ) {
				return url.process( _.cloneDeep( tokens ), halUrl, data, resourceName );
			};
		}
	}
}

function getOptionCache( resources, prefix, version, excludeChildren, auth, skipAuthCheck ) {
	var linkFn = getLinksFn( resources, prefix, version, true, skipAuthCheck );
	var options = { _links: {} };
	var versions = [ "1" ];
	_.reduce( resources, function( rAcc, resource, resourceName ) {
		versions = versions.concat( resource.versions ? _.keys( resource.versions ) : [] );
		resource = getVersion( resource, version );
		_.each( resource.actions, function( action, actionName ) {
			if ( ( excludeChildren && !resource.parent ) || !excludeChildren ) {
				var main = linkFn( resourceName, actionName, {}, {}, undefined, undefined, auth );
				if ( !_.isEmpty( main ) ) {
					options._links[ [ resourceName, actionName ].join( ":" ) ] = _.values( main )[ 0 ];
				}
				_.each( resource.actions, function( link, linkName ) {
					var additional = _.values( linkFn( resourceName, linkName, {}, {}, undefined, undefined, auth ) )[ 0 ];
					if ( !_.isEmpty( additional ) ) {
						options._links[ [ resourceName, linkName ].join( ":" ) ] = additional;
					}
				} );
			}
		} );
		return rAcc;
	}, options );
	options._versions = _.unique( versions );
	return options;
}

function getOptionsFn( resources, prefix, version, excludeChildren, auth, skipAuthCheck ) {
	var options = getOptionCache( resources, prefix, version, excludeChildren, auth, skipAuthCheck );
	return function( types ) {
		options._mediaTypes = _.keys( types );
		return options;
	};
}

function getOriginCache( resources, prefix, version ) {
	var cache = {};
	var urlFn = getUrlFn( resources, prefix, version );

	_.reduce( resources, function( rAcc, resource, resourceName ) {
		resource = getVersion( resource, version );
		rAcc[ resourceName ] = _.reduce( resource.actions, function( acc, action, actionName ) {
			var method = action.method.toUpperCase();
			acc[ actionName ] = function( parentUrl /*, auth */ ) {
				var actionUrl = urlFn( resourceName, actionName, {}, parentUrl, {} );
				return { href: actionUrl, method: method };
			};
			return acc;
		}, {} );
		return rAcc;
	}, cache );
	return cache;
}

function getOriginFn( resources, prefix, version ) {
	var originCache = getOriginCache( resources, prefix, version );
	return function( resourceName, actionName, envelope, parentUrl ) {
		return originCache[ resourceName ][ actionName ]( envelope.data, parentUrl );
	};
}

function getParentTokens( parentUrl, resource ) {
	var templatedParent = isTemplated( parentUrl );
	if ( templatedParent ) {
		var tokens = _.map( url.getTokens( parentUrl ), function( token ) {
			token.resource = resource.parent;
			token.camel = url.toCamel( token );
			return token;
		} );
		return tokens;
	} else {
		return [];
	}
}

function getParentUrlCache( resources, version ) {
	var cache = {};

	function visitParent( name ) {
		var parentName = resources[ name ].parent;
		var tokens = [];
		var segments = [];
		if ( parentName ) {
			var parent = resources[ parentName ];
			var parentUrl = url.forHal( parent.actions.self.url );
			if ( parentUrl ) {
				segments.push( parentUrl );
				tokens = getParentTokens( parentUrl, resources[ name ] );
				if ( parent.parent ) {
					var child = visitParent( parentName );
					segments = child.segments.concat( segments );
					tokens = child.tokens.concat( tokens );
				}
			}
		}
		return {
			segments: segments,
			tokens: tokens
		};
	}

	cache = _.reduce( resources, function( acc, v, k ) {
		v = getVersion( v, version );
		var meta = visitParent( k );
		var segments = meta.segments;
		var tokens = meta.tokens;
		var joined = segments.join( "" ).replace( "//", "/" );
		acc[ k ] = {
			url: joined,
			tokens: tokens
		};
		return acc;
	}, cache );

	return cache;
}

function getParentUrlFn( resources, version ) { // jshint ignore:line
	var cache = getParentUrlCache( resources );
	return function( resourceName, data ) {
		var meta = cache[ resourceName ];
		var tokens = _.clone( meta.tokens );
		var parent = resources[ resourceName ].parent;
		var resourceSegment = getResourcePrefix( meta.url, resources[ parent ], parent );
		var parentUrl = [ resourceSegment, meta.url ].join( "" ).replace( "//", "/" );
		var values = _.reduce( tokens, function( acc, token ) {
			var val = url.readToken( resourceName, data, token );
			acc[ token.property ] = acc[ token.camel ] = val;
			return acc;
		}, {} );
		return url.process( tokens, parentUrl, values, resourceName );
	};
}

function getRenderFn( resources, prefix, version ) {
	var resourceFn = getResourceFn( resources, prefix, version );
	var resourcesFn = getResourcesFn( resources, prefix, version );

	return function( resourceName, actionName, envelope, data, parentUrl, originUrl, originMethod, authCheck ) {
		if ( _.isArray( data ) ) {
			return resourcesFn( resourceName, actionName, envelope, data, parentUrl, originUrl, originMethod, authCheck );
		} else {
			return resourceFn( resourceName, actionName, envelope, data, parentUrl, originUrl, originMethod, authCheck );
		}
	};
}

function getResourceCache( resources, prefix, version ) {
	var cache = {};
	var renderFn = getBodyFn( resources, prefix, version );
	var linkFn = getLinksFn( resources, prefix, version );
	var prefixFn = getPrefix.bind( undefined, resources, prefix );

	_.reduce( resources, function( rAcc, resource, resourceName ) {
		resource = getVersion( resource, version );
		var prefixes = prefixFn( resource );
		var urlPrefix = [
				prefixes.urlPrefix,
				prefixes.apiPrefix
			].join( "" ).replace( "//", "/" );
		rAcc[ resourceName ] = _.reduce( resource.actions, function( acc, action, actionName ) {
			acc[ actionName ] = function( envelope, data, parentUrl, originUrl, originMethod, auth ) {
				var body = renderFn( resourceName, actionName, data );
				var main = linkFn( resourceName, actionName, envelope, data, parentUrl, auth );
				var origin = ( originUrl && originMethod ) ?
					{ href: originUrl, method: originMethod } :
					main[ actionName ];
				_.each( resource.actions, function( link, linkName ) {
					_.defaults( main, linkFn( resourceName, linkName, envelope, data, parentUrl, auth ) );
				} );
				body._links = main;
				body._origin = origin;
				body._resource = resourceName;
				body._action = actionName;
				var embedded = _.reduce( action.embed, function( eAcc, child, childName ) {
					var childFn = cache[ child.resource ][ child.render ];
					var childItem = data[ childName ];
					var embed;
					var inheritedUrl = resources[ child.resource ].parent ? body._links.self.href : "";
					inheritedUrl = inheritedUrl.replace( urlPrefix, "" );
					if ( _.isArray( childItem ) ) {
						embed = _.map( childItem, function( child ) {
							var item = childFn( envelope, child, inheritedUrl, undefined, undefined, auth );
							if ( child.actions ) {
								item._links = _.pick( item._links, child.actions );
							}
							return item;
						} );
					} else if ( childItem ) {
						embed = childFn( envelope, child, inheritedUrl, undefined, undefined, auth );
						if ( child.actions ) {
							embed._links = _.pick( embed._links, child.actions );
						}
					}
					if ( !_.isEmpty( embed ) ) {
						eAcc[ childName ] = embed;
					}
					return eAcc;
				}, {} );
				if ( !_.isEmpty( embedded ) ) {
					body._embedded = embedded;
				}
				return body;
			};
			return acc;
		}, {} );
		return rAcc;
	}, cache );

	return cache;
}

function getResourceFn( resources, prefix, version ) { // jshint ignore:line
	var resourceCache = getResourceCache( resources, prefix, version );
	return function( resourceName, actionName, envelope, data, parentUrl, originUrl, originMethod, auth ) {
		return resourceCache[ resourceName ][ actionName ]( envelope, data, parentUrl, originUrl, originMethod, auth );
	};
}

function getResourcesFn( resources, prefix, version ) { // jshint ignore:line
	var resourceCache = getResourceCache( resources, prefix, version );
	var originFn = getOriginFn( resources, prefix, version );

	return function( resourceName, actionName, envelope, data, parentUrl, originUrl, originMethod, auth ) {
		var body = {};
		var resource = getVersion( resources[ resourceName ], version );
		var render = resource.actions[ actionName ].render;
		var items = render ? pluralize.plural( render.resource ) : pluralize.plural( resourceName );
		var list = _.map( data, function( item, childProp ) {
			var child = data[ childProp ];
			if ( render ) {
				return resourceCache[ render.resource ][ render.action ]( envelope, child, parentUrl, undefined, undefined, auth );
			} else {
				return resourceCache[ resourceName ][ actionName ]( envelope, child, parentUrl, undefined, undefined, auth );
			}
		} );
		if ( originUrl && originMethod ) {
			body._origin = { href: originUrl, method: originMethod };
		} else {
			body._origin = originFn( resourceName, actionName, data[ 0 ], parentUrl );
		}
		body[ items ] = list;
		return body;
	};
}

function getResourcePrefix( url, resource, resourceName ) {
	if ( !resource || resource.resourcePrefix === false ) {
		return "";
	} else {
		var regex = new RegExp( "[\/]" + resourceName );
		return regex.test( url ) ? "" : "/" + resourceName;
	}
}

function getVersion( resource, version ) { // jshint ignore:line
	if ( version === undefined ) {
		return resource;
	} else {
		return getVersions( resource )[ version ] || resource;
	}
}

function getVersions( resource ) { // jshint ignore:line
	var versions = { 1: resource };
	_.each( resource.versions, function( versionSpec, version ) {
		versions[ version ] = applyVersion( resource, version );
	} );
	return versions;
}

function getUrlFn( resources, prefix, version ) { // jshint ignore:line
	var cache = getActionUrlCache( resources, prefix, version );
	return function( resourceName, actionName, data, parentUrl, envelope ) {
		return cache[ resourceName ][ actionName ]( data, parentUrl, envelope );
	};
}

function isTemplated( url ) { // jshint ignore:line
	return url.indexOf( "{" ) > 0 || url.indexOf( ":" ) > 0;
}

function removeEmbedded( embedded, unit ) { // jshint ignore:line
	return embedded ? function( data ) {
		return _.omit( data, embedded );
	} : unit;
}

function shouldRenderFn( action, actionName, resourceName, forOptions ) { // jshint ignore:line
	var canRender, allowRender;
	if ( action.condition && !forOptions ) {
		canRender = function canRender( data, envelope ) {
			return action.condition( envelope, data || {} );
		};
	} else {
		canRender = function canRender() {
			return true;
		};
	}
	if ( action.authorize ) {
		allowRender = action.authorize;
	}
	var authName = [ resourceName, actionName ].join( ":" );
	return function( envelope, data, auth ) {
		var can = canRender( data, envelope );
		var should = allowRender ? allowRender( envelope, data || envelope.context ) : auth( authName, data, envelope.context );
		return ( can && should );
	};
}

module.exports = {
	bodyFn: getBodyFn,
	linkFn: getLinksFn,
	optionsFn: getOptionsFn,
	parentFn: getParentUrlFn,
	renderFn: getRenderFn,
	resourceFn: getResourceFn,
	resourcesFn: getResourcesFn,
	urlFn: getUrlFn,
	urlCache: getParentUrlCache,
	versionsFor: getVersions
};
