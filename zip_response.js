'use strict';

const zlib = require('zlib');
const concatStream = require('concat-stream');
const BufferHelper = require('bufferhelper');

/**
 * Modify the response of json
 * @param res {Response} The http response
 * @param proxyRes {proxyRes|String} String: The http header content-encoding: gzip/deflate
 * @param callback {Function} Custom modified logic
 */
module.exports = function modifyResponse(res, proxyRes, callback) {
  let contentEncoding = proxyRes;
  if (proxyRes && proxyRes.headers) {
    contentEncoding = proxyRes.headers['content-encoding'];
    // Delete the content-length if it exists. Otherwise, an exception will occur
    // @see: https://github.com/langjt/node-http-proxy-json/issues/10
    if ('content-length' in proxyRes.headers) {
      delete proxyRes.headers['content-length'];
      //delete proxyRes.headers['content-encoding'];
    }
  }

  let unzip, zip;
  // Now only deal with the gzip/deflate/undefined content-encoding.
  switch (contentEncoding) {
    case 'gzip':
      unzip = zlib.Gunzip();
      zip = zlib.Gzip();
      break;
    case 'deflate':
      unzip = zlib.Inflate();
      zip = zlib.Deflate();
      break;
  }

  // The cache response method can be called after the modification.
  let _write = res.write;
  let _end = res.end;

  if (unzip) {
    unzip.on('error', function (e) {
      console.log('Unzip error: ', e);
      _end.call(res);
    });
    console.log("Unzipping...");
    handleCompressed(res, _write, _end, unzip, zip, callback);
  } else if (!contentEncoding) {
    handleUncompressed(res, _write, _end, callback);
  } else {
    console.log('Not supported content-encoding: ' + contentEncoding);
  }
};

/**
 * handle compressed
 */
function handleCompressed(res, _write, _end, unzip, zip, callback) {
  // The rewrite response method is replaced by unzip stream.
  res.write = data => unzip.write(data);

  res.end = () => unzip.end();

  // Concat the unzip stream.
  let concatWrite = concatStream(data => {
    console.log("Concat write");
    let body;
    body = data.toString();

    // Custom modified logic
    if (typeof callback === 'function') {
      body = callback(body);
    }

    let finish = _body => {
      // Converts the JSON to buffer.
      let body = new Buffer(_body);

      _write.call(res, body);
      _end.call(res);

      // // Call the response method and recover the content-encoding.
      // zip.on('data', chunk => {
      //     console.log("got chunk of data");
      //     _write.call(res, chunk)
      // });
      // zip.on('end', () => {
      //     console.log("end of zip");
      //     _end.call(res)
      // });

      // zip.write(body);
      // zip.end();
    };

    if (body && body.then) {
      body.then(finish);
    } else {
      finish(body);
    }
  });

  console.log("starting to unzip");

  unzip.pipe(concatWrite);
}

/**
 * handle Uncompressed
 */
function handleUncompressed(res, _write, _end, callback) {
  let buffer = new BufferHelper();
  // Rewrite response method and get the content.
  res.write = data => buffer.concat(data);

  res.end = () => {
    let body;
    body = buffer.toBuffer().toString();

    // Custom modified logic
    if (typeof callback === 'function') {
      body = callback(body);
    }

    let finish = _body => {
      // Converts the JSON to buffer.
      let body = new Buffer(_body);

      // Call the response method
      _write.call(res, body);
      _end.call(res);
    };

    if (body && body.then) {
      body.then(finish);
    } else {
      finish(body);
    }
  };
}