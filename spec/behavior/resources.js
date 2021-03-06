var resources = {
	parent: {
		actions: {
			self: {
				method: "get",
				url: "/parent/:id"
			},
			list: {
				method: "get",
				url: "/parent"
			},
			// this will only display when fullOptions are requested (authorize is skipped)
			bogus: {
				method: "get",
				url: "/bogus",
				authorize: function( envelope ) {
					return false;
				}
			},
			children: {
				method: "get",
				url: "/parent/:id/child",
				render: { resource: "child", action: "self" },
				condition: function( envelope, data ) {
					return data.children && data.children.length > 0;
				},
				links: {
					"next-child-page": function( envelope, data ) {
						if ( envelope.data ) {
							var page = envelope.data.page || undefined;
							var size = envelope.data.size || undefined;
							if ( page && size ) {
								return "/parent/:id/child?page=" + ( page + 1 ) + "&size=" + ( size );
							}
						}
					}
				},
				parameters: {
					page: function( envelope, data ) {
						var limit = 1;
						var size = envelope.data ? envelope.data.size : 0;
						if ( data && data.children && size ) {
							var count = data.children.length;
							return { range: [ 1, count / size ] };
						}
					},
					size: { range: [ 1, 100 ] }
				}
			}
		},
		versions: {
			2: {
				self: {
					include: [ "id", "title" ]
				}
			}
		}
	},
	child: {
		parent: "parent",
		actions: {
			self: {
				method: "get",
				url: "/child/:child.id",
				embed: {
					grandChildren: {
						resource: "grandChild",
						render: "self",
						actions: [ "self", "create" ]
					}
				}
			},
			change: {
				method: "put",
				url: "/child/:child.id",
				authorize: function( envelope, data ) {
					var userName = envelope.user ? envelope.user.name : "nobody";
					if ( userName === "Evenly" ) {
						console.log( "    WTF", data.id );
						return data.id % 2 === 0;
					} else if ( userName === "Oddly" ) {
						console.log( "    WTF", data.id );
						return data.id % 2 === 1;
					} else {
						return false;
					}
				}
			}
		}
	},
	grandChild: {
		parent: "child",
		resourcePrefix: false,
		actions: {
			self: {
				method: "get",
				url: "/grand/:grandChild.id"
			},
			create: {
				method: "post",
				url: "/grand"
			},
			delete: {
				method: "delete",
				url: "/grand/:grandChild.id"
			}
		}
	}
};
module.exports = resources;
