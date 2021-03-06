var _ = require( "lodash" );

function HttpEnvelope( req, res ) {
	this.transport = "http";
	this.context = req.context;
	this.cookies = req.cookies;
	this.data = req.body || {};
	this.files = req.files;
	this.headers = req.headers;
	this.params = {};
	this.path = this.url = req.url;
	this.responseStream = res;
	this.session = req.session;
	this.user = req.user;
	this._original = {
		req: req,
		res: res
	};

	[ req.params, req.query ].forEach( function( source ) {
		Object.keys( source ).forEach( function( key ) {
			var val = source[ key ];
			if ( !this.data.hasOwnProperty( key ) ) {
				this.data[ key ] = val;
			}
			if ( !this.params.hasOwnProperty( key ) ) {
				this.params[ key ] = val;
			}
		}.bind( this ) );
	}.bind( this ) );

	if ( req.extendHttp ) {
		_.each( req.extendHttp, function( val, key ) {
			this[ key ] = val;
		}.bind( this ) );
	}
}

module.exports = HttpEnvelope;
