# -*- coding: utf-8 -

import socket
import os
import cgi

PORT = 8000
MOBWRITE_PORT = 3017
DEFAULT_EDITOR = os.path.abspath(os.path.join(os.path.split(__file__)[0], '../demo/index.html'))

def application(environ, start_response):
    """Simplest possible application object"""
    if environ['QUERY_STRING'] and environ['QUERY_STRING'] == 'editor':
        data = printEditor()
        response_headers = [
            ('Content-type','text/html'),
            ('Content-Length', str(len(data)))
        ]
        start_response('200 OK', response_headers)
        return iter([data])
    else:
        form = cgi.FieldStorage(fp=environ['wsgi.input'],
                                    environ=environ,
                                    keep_blank_values=1)
        out_string = "\n"
        if form.has_key('q'):
            out_string = form['q'].value # Client sending a sync.  Requesting text return.
        elif form.has_key('p'):
            out_string = form['p'].value # Client sending a sync.  Requesting JS return.
        
        in_string = ""
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            s.connect(("localhost", MOBWRITE_PORT))
        except socket.error, msg:
            s = None
        if not s:
            # Python CGI can't connect to Python daemon.
            data = 'ERROR: Cannot reach the mobwrite gateway.'
            response_headers = [
                ('Content-type', 'text/plain'),
                ('Content-Length', str(len(data)))
            ]
            start_response('200 OK', response_headers)
            return iter([data])
        else:
            # Timeout if MobWrite daemon dosen't respond in 10 seconds.
            s.settimeout(10.0)
            s.send(out_string)
            while 1:
                line = s.recv(1024)
                if not line:
                    break
                in_string += line
            s.close()
        
        if form.has_key('p'):
            # Client sending a sync.  Requesting JS return.
            in_string = in_string.replace("\\", "\\\\").replace("\"", "\\\"")
            in_string = in_string.replace("\n", "\\n").replace("\r", "\\r")
            in_string = "mobwrite.callback(\"%s\");" % in_string
        
        data = in_string
        response_headers = [
            ('Content-type','text/javascript'),
            ('Content-Length', str(len(data)))
        ]
        start_response('200 OK', response_headers)
        return iter([data])


def printEditor():
    with open(DEFAULT_EDITOR) as f:
        editor = f.read()
        return editor
    return "Unable to open %s" % DEFAULT_EDITOR


if __name__ == '__main__':
    from wsgiref.simple_server import make_server
    http = make_server('', PORT, application)
    http.serve_forever()