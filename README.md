## Okey-dokey

Basically this is an SVN import of the [google-mobwite project over at google code](http://code.google.com/p/google-mobwrite) with some minor alterations
and patching to the gateway script up and running via WSGI instead of mod_python. I have also cleaned away all the other stuff that I didn't need (java, php, etc).

The main meat of the updates are to be found in `daemon/gateway.py`, which is pretty much a straight up port of Neil Fraser's original
python gateway to run under WSGI instead of mod_python. Verrra nice.

### Cajun style

I'm just going to assume you are using virtualenv & virtualevwrapper because you should be...

1. `virtualenv --no-site-packages mobwrite`
2. `cdvirtualenv`
3. `git clone git://github.com/plasticine/google-mobwrite.git`

Open a couple of new terminals (& move into the new virtualenv again, etc) you can;

1. First terminal;
    * `cd google-mobwrite/daemon`
    * `python mobwrite_daemon.py`
2. Second terminal;
    * `cd google-mobwrite/daemon`
    * `python gateway.py`

Now you should be able to test everything is working locally over yonder: [http://localhost:8000/?editor](http://localhost:8000/?editor).