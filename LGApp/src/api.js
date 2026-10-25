(function (root) {
  'use strict';
  function API(base, pin) { this.base = base; this.pin = pin; this.pending = []; }
  API.prototype.request = function (path, method, data) {
    var api = this;
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      api.pending.push(xhr);
      function finish(error, result) {
        api.pending = api.pending.filter(function (item) { return item !== xhr; });
        if (error) reject(error); else resolve(result);
      }
      function fail(message, status) { var error = new Error(message); error.status = status || 0; finish(error); }
      xhr.open(method || 'GET', api.base + path);
      xhr.timeout = 30000;
      if (api.pin) xhr.setRequestHeader('X-Web-Pin', api.pin);
      if (data !== undefined) xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.onload = function () {
        var result;
        try { result = JSON.parse(xhr.responseText); } catch (_) { return fail('La dirección no responde como una MiniTV. Comprueba el puerto 5050.'); }
        if (xhr.status >= 200 && xhr.status < 300) finish(null, result);
        else fail(xhr.status === 401 ? 'El PIN no es válido o ha cambiado. Vuelve a conectar.' : (result.error || result.errorCode || 'Error del servidor (' + xhr.status + ').'), xhr.status);
      };
      xhr.onerror = function () { fail('No se puede conectar. Comprueba la dirección, la red y que DeviceApp esté actualizado.'); };
      xhr.ontimeout = function () { fail('La MiniTV tarda demasiado en responder. Puedes reintentar.'); };
      xhr.onabort = function () { fail('Solicitud cancelada.', -1); };
      xhr.send(data === undefined ? null : JSON.stringify(data));
    });
  };
  API.prototype.media = function (path, values) {
    var params = {}; Object.keys(values || {}).forEach(function (k) { params[k] = values[k]; });
    params.pin = this.pin;
    return this.base + path + '?' + root.TVCore.query(params);
  };
  API.prototype.abort = function () { this.pending.slice().forEach(function (xhr) { xhr.abort(); }); };
  root.TVAPI = API;
}(this));
