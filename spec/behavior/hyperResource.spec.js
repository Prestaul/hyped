require( "../setup" );
var url = require( "../../src/urlTemplate.js" );
var HyperResource = require( "../../src/hyperResource.js" );

var limit = 15;

var resources = require( "./resources.js" );

describe( "Action links", function() {
	describe( "With an inheritence hierarchy greater than 2", function() {
		describe( "when creating parentUrls", function() {
			var parent, child, grandChild, urlCache;

			before( function() {
				var model = {
					parentId: 1,
					childId: 2,
					id: 3
				};
				var fn = HyperResource.parentFn( resources, { urlPrefix: "/test", apiPrefix: "/api" } );
				urlCache = HyperResource.urlCache( resources, { urlPrefix: "/test", apiPrefix: "/api" } );
				parent = fn( "parent", model );
				child = fn( "child", model );
				grandChild = fn( "grandChild", model );
			} );

			it( "should build the urlCache correctly", function() {
				urlCache.should.eql( {
					parent: { url: "", tokens: [] },
					child: { url: "/parent/{id}", tokens: [
							{ original: "id", namespace: "", resource: "parent", property: "id", camel: "parentId" }
						] },
					grandChild: { url: "/parent/{id}/child/{child.id}", tokens: [
							{ original: "id", namespace: "", resource: "parent", property: "id", camel: "parentId" },
							{ original: "child.id", namespace: "", resource: "child", property: "id", camel: "childId" }
						] }
				} );
			} );

			it( "should build the correct parentUrl for parent", function() {
				parent.should.equal( "" );
			} );

			it( "should build the correct parentUrl for child", function() {
				child.should.equal( "/parent/1" );
			} );

			it( "should build the correct parentUrl for grandChild", function() {
				grandChild.should.equal( "/parent/1/child/2" );
			} );
		} );

		describe( "when creating action urls", function() {
			var parent, child, grandChild, children, next;

			before( function() {
				var model = {
					parentId: 1,
					childId: 2,
					id: 3
				};
				var fn = HyperResource.urlFn( resources );
				parent = fn( "parent", "self", { id: 1 } );
				children = fn( "parent", "children", { id: 1 } );
				next = fn( "parent", "next-child-page", { id: 1 }, undefined, { data: { page: 1, size: 5 } } );
				child = fn( "child", "self", model );
				grandChild = fn( "grandChild", "self", model );
			} );

			it( "should build the correct parent url", function() {
				parent.should.equal( "/parent/1" );
			} );

			it( "should build the correct children url", function() {
				children.should.equal( "/parent/1/child" );
			} );

			it( "should generate the correct next-child-page url", function() {
				next.should.equal( "/parent/1/child?page=2&size=5" );
			} );

			it( "should build the correct child url", function() {
				child.should.equal( "/parent/1/child/2" );
			} );

			it( "should build the correct grandChild url", function() {
				grandChild.should.equal( "/parent/1/child/2/grand/3" );
			} );
		} );

		describe( "when creating action urls with a prefix", function() {
			var parent, child, grandChild, children, next;

			before( function() {
				var model = {
					parentId: 1,
					childId: 2,
					id: 3
				};
				var fn = HyperResource.urlFn( resources, { urlPrefix: "/test", apiPrefix: "/api" } );
				parent = fn( "parent", "self", { id: 1 } );
				children = fn( "parent", "children", { id: 1 } );
				next = fn( "parent", "next-child-page", { id: 1 }, undefined, { data: { page: 1, size: 5 } } );
				child = fn( "child", "self", model );
				grandChild = fn( "grandChild", "self", model );
			} );

			it( "should build the correct parent url", function() {
				parent.should.equal( "/test/api/parent/1" );
			} );

			it( "should build the correct children url", function() {
				children.should.equal( "/test/api/parent/1/child" );
			} );

			it( "should generate the correct next-child-page url", function() {
				next.should.equal( "/test/api/parent/1/child?page=2&size=5" );
			} );

			it( "should build the correct child url", function() {
				child.should.equal( "/test/api/parent/1/child/2" );
			} );

			it( "should build the correct grandChild url", function() {
				grandChild.should.equal( "/test/api/parent/1/child/2/grand/3" );
			} );
		} );
	} );

	describe( "When getting versions", function() {
		var parentVersions, childVersions;

		before( function() {
			parentVersions = HyperResource.versionsFor( resources.parent );
			childVersions = HyperResource.versionsFor( resources.child );
		} );

		it( "should produce new version correctly", function() {
			parentVersions[ 2 ].actions.self.include.should.eql( [ "id", "title" ] );
		} );

		it( "should keep version changes separate from original", function() {
			expect( parentVersions[ 1 ].actions.self.include ).not.to.exist; // jshint ignore:line
		} );

		it( "should return a version hash with one entry for resources without a version hash", function() {
			expect( childVersions[ 1 ].actions.self ).to.exist; // jshint ignore:line
		} );
	} );

	describe( "When rendering links from different actions", function() {
		describe( "when rendering an \"plain\" action", function() {
			var expected = { self: { href: "/parent/1", method: "GET" } };
			var links;

			before( function() {
				var model = {
					id: 1
				};
				var fn = HyperResource.linkFn( resources );
				links = fn( "parent", "self", {}, model );
			} );

			it( "should produce expected links", function() {
				links.should.eql( expected );
			} );
		} );

		describe( "when rendering action with failed condition", function() {
			var expected = {};
			var links;

			before( function() {
				var model = {
					id: 1
				};
				var fn = HyperResource.linkFn( resources );
				links = fn( "parent", "children", {}, model );
			} );

			it( "should produce expected links", function() {
				links.should.eql( expected );
			} );
		} );

		describe( "when rendering action with failed auth", function() {
			var expected = {};
			var links;

			before( function() {
				var model = {
					id: 1
				};
				var fn = HyperResource.linkFn( resources );
				links = fn( "parent", "children", {}, model, "", function() {
					return false;
				} );
			} );

			it( "should produce expected links", function() {
				links.should.eql( expected );
			} );
		} );

		describe( "when rendering action with passed condition and no page size specified", function() {
			var parameters = {
				size: { range: [ 1, 100 ] }
			};
			var expected = {
				children: { href: "/parent/1/child", method: "GET", parameters: parameters }
			};
			var links;

			before( function() {
				var model = {
					id: 1,
					children: [ {} ]
				};
				var fn = HyperResource.linkFn( resources );
				links = fn( "parent", "children", { data: { page: 1 } }, model );
			} );

			it( "should produce expected links", function() {
				links.should.eql( expected );
			} );
		} );

		describe( "when rendering action with passed condition and context", function() {
			var parameters = {
				page: { range: [ 1, 2 ] },
				size: { range: [ 1, 100 ] }
			};
			var expected = {
				children: { href: "/parent/1/child", method: "GET", parameters: parameters },
				"next-child-page": { href: "/parent/1/child?page=2&size=5", method: "GET", parameters: parameters }
			};
			var links;

			before( function() {
				var model = {
					id: 1,
					children: [ {}, {}, {}, {}, {}, {}, {}, {}, {}, {} ]
				};
				var fn = HyperResource.linkFn( resources );
				links = fn( "parent", "children", { data: { page: 1, size: 5 } }, model, "" );
			} );

			it( "should produce expected links", function() {
				links.should.eql( expected );
			} );
		} );

		describe( "when rendering action with specific version", function() {
			var parameters = {
				page: { range: [ 1, 1 ] },
				size: { range: [ 1, 100 ] }
			};
			var expected = {
				id: 1,
				title: "test",
				_origin: { href: "/parent/1", method: "GET" },
				_resource: "parent",
				_action: "self",
				_links: {
					self: { href: "/parent/1", method: "GET" },
					list: { href: "/parent", method: "GET" },
					children: { href: "/parent/1/child", method: "GET", parameters: parameters },
					"next-child-page": { href: "/parent/1/child?page=2&size=5", method: "GET", parameters: parameters }
				}
			};
			var response;
			var data = {
				id: 1,
				title: "test",
				description: "this is a test",
				children: [ {}, {}, {}, {}, {} ]
			};
			var requestData = {
				page: 1,
				size: 5
			};

			before( function() {
				var fn = HyperResource.resourceFn( resources, "", 2 );
				response = fn( "parent", "self", { data: requestData }, data, "" );
			} );

			it( "should return the correct response", function() {
				response.should.eql( expected );
			} );
		} );

		describe( "when rendering action without embedded resources", function() {
			var parameters = {
				page: { range: [ 1, 1 ] },
				size: { range: [ 1, 100 ] }
			};
			var expected = {
				id: 1,
				title: "test",
				description: "this is a test",
				children: [ {}, {}, {}, {}, {} ],
				_origin: { href: "/parent/1", method: "GET" },
				_resource: "parent",
				_action: "self",
				_links: {
					self: { href: "/parent/1", method: "GET" },
					list: { href: "/parent", method: "GET" },
					children: { href: "/parent/1/child", method: "GET", parameters: parameters },
					"next-child-page": { href: "/parent/1/child?page=2&size=5", method: "GET", parameters: parameters }
				}
			};
			var response;
			var data = {
				id: 1,
				title: "test",
				description: "this is a test",
				children: [ {}, {}, {}, {}, {} ]
			};
			var requestData = {
				page: 1,
				size: 5
			};

			before( function() {
				var fn = HyperResource.resourceFn( resources );
				response = fn( "parent", "self", { data: requestData }, data, "" );
			} );

			it( "should return the correct response", function() {
				response.should.eql( expected );
			} );
		} );

		describe( "when rendering action with embedded resources including parent id in result", function() {
			var expected = require( "./actionWithEmbeddedResources.js" );
			var response;
			var data = {
				id: 2,
				parentId: 1,
				title: "child",
				grandChildren: [ { id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 } ]
			};
			var elapsed;
			var envelope = {
				user: {
					name: "Evenly"
				}
			};
			before( function() {
				var fn1 = HyperResource.resourceFn( resources, { urlPrefix: "/test", apiPrefix: "/api" } );

				var start = Date.now();
				response = fn1( "child", "self", envelope, data );
				elapsed = Date.now() - start;
			} );

			it( "should return the correct response", function() {
				response.should.eql( expected );
			} );

			it( "new should be \"quick\"", function() {
				elapsed.should.be.below( limit );
			} );
		} );
	} );

	describe( "when rendering options including children", function() {
		var expected = {
			_mediaTypes: [],
			_versions: [ "1", "2" ],
			_links: {
				"parent:self": { href: "/parent/{id}", method: "GET", templated: true },
				"parent:list": { href: "/parent", method: "GET" },
				"parent:children": { href: "/parent/{id}/child", method: "GET", templated: true, parameters: {
						size: { range: [ 1, 100 ] }
					} },
				"parent:bogus": { href: "/parent/bogus", method: "GET" },
				"child:self": { href: "/parent/{parentId}/child/{id}", method: "GET", templated: true },
				"child:change": { href: "/parent/{parentId}/child/{id}", method: "PUT", templated: true },
				"grandChild:self": { href: "/parent/{parentId}/child/{childId}/grand/{id}", method: "GET", templated: true },
				"grandChild:create": { href: "/parent/{parentId}/child/{childId}/grand", method: "POST", templated: true },
				"grandChild:delete": { href: "/parent/{parentId}/child/{childId}/grand/{id}", method: "DELETE", templated: true }
			}
		};
		var options;

		before( function() {
			var fn = HyperResource.optionsFn( resources, undefined, undefined, undefined, undefined, true );
			options = fn( {}, {} );
		} );

		it( "should render options correctly", function() {
			options.should.eql( expected );
		} );
	} );

	describe( "when rendering options excluding children", function() {
		var expected = {
			_mediaTypes: [],
			_versions: [ "1", "2" ],
			_links: {
				"parent:self": { href: "/parent/{id}", method: "GET", templated: true },
				"parent:list": { href: "/parent", method: "GET" },
				"parent:children": { href: "/parent/{id}/child", method: "GET", templated: true, parameters: {
						size: { range: [ 1, 100 ] }
					} }
			}
		};
		var options;

		before( function() {
			var fn = HyperResource.optionsFn( resources, "", undefined, true );
			options = fn();
		} );

		it( "should render options correctly", function() {
			options.should.eql( expected );
		} );
	} );

	describe( "when rendering a list of top-level resources", function() {
		var expected = require( "./topLevelResources.js" );
		var response;
		var data = [
			{
				id: 1,
				title: "one",
				description: "the first item",
				children: [ {} ]
			},
			{
				id: 2,
				title: "two",
				description: "the second item",
				children: [ {} ]
			}
		];
		var elapsed;

		before( function() {
			var fn1 = HyperResource.resourcesFn( resources );

			var start = Date.now();
			response = fn1( "parent", "self", {}, data, "", "/parent", "GET" );
			elapsed = Date.now() - start;
		} );

		it( "should return the correct response", function() {
			response.should.eql( expected );
		} );

		it( "new should be \"quick\"", function() {
			elapsed.should.be.below( limit );
		} );
	} );

	describe( "when rendering a list of resources from another resource", function() {
		var expected = require( "./listFromOtherResource.js" );
		var response;
		var data = [
			{
				id: 1,
				parentId: 1,
				title: "one",
				description: "the first item"
			},
			{
				id: 2,
				parentId: 1,
				title: "two",
				description: "the second item"
			},
			{
				id: 3,
				parentId: 1,
				title: "three",
				description: "the third item"
			}
		];
		var elapsed;

		before( function() {
			var fn1 = HyperResource.resourcesFn( resources );
			var start = Date.now();
			var envelope = {
				user: {
					name: "Oddly"
				}
			};
			response = fn1( "child", "self", envelope, data, "", "/parent/1/child", "GET" );
			elapsed = Date.now() - start;
		} );

		it( "should return the correct response", function() {
			response.should.eql( expected );
		} );

		it( "new should be \"quick\"", function() {
			elapsed.should.be.below( limit );
		} );
	} );

	describe( "Timing token replacement", function() {
		var testUrl = "/parent/:id/child/:child.id";

		describe( "Replacing 2 tokens 1000 times with regex", function() {
			var elapsed;
			var urls = [];
			before( function() {
				var start = Date.now();
				var tokens = url.getTokens( testUrl );
				var halUrl = url.forHal( testUrl );
				for ( var i = 0; i < 1000; i++ ) {
					urls.push( url.process( _.clone( tokens ), halUrl, { id: 1, childId: 2 }, "parent" ) );
				}
				elapsed = Date.now() - start;
			} );

			it( "should produce a valid URL", function() {
				urls[ 1 ].should.equal( "/parent/1/child/2" );
			} );

			it( "should be \"quick\"", function() {
				elapsed.should.be.below( 40 );
			} );
		} );
	} );
} );
