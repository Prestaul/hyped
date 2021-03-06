module.exports = {
	_origin: { href: "/parent/1/child", method: "GET" },
	children: [
		{
			id: 1,
			parentId: 1,
			title: "one",
			description: "the first item",
			_resource: "child",
			_action: "self",
			_origin: { href: "/parent/1/child/1", method: "GET" },
			_links: {
				self: { href: "/parent/1/child/1", method: "GET" },
				change: { href: "/parent/1/child/1", method: "PUT" }
			}
		},
		{
			id: 2,
			parentId: 1,
			title: "two",
			description: "the second item",
			_resource: "child",
			_action: "self",
			_origin: { href: "/parent/1/child/2", method: "GET" },
			_links: {
				self: { href: "/parent/1/child/2", method: "GET" }
			}
		},
		{
			id: 3,
			parentId: 1,
			title: "three",
			description: "the third item",
			_resource: "child",
			_action: "self",
			_origin: { href: "/parent/1/child/3", method: "GET" },
			_links: {
				self: { href: "/parent/1/child/3", method: "GET" },
				change: { href: "/parent/1/child/3", method: "PUT" }
			}
		}
	]
};
