import Joi from 'joi';
import { expect } from 'chai';
import sinon from 'sinon';
import { createEventDispatcher } from '../src';

describe('createEventDispatcher', () => {
  let dispatcher;

  beforeEach(() => {
    dispatcher = createEventDispatcher();
  });

  describe('handling results', () => {
    describe('that are valid', () => {
      it('should return the result', () => {
        dispatcher.subscribe('test', () => 'it works');

        return dispatcher.dispatch('test').then((result) => {
          expect(result).to.equal('it works');
        });
      });
    });

    describe('should throw an error when handling a result twice', () => {
      it('when returning a value and calling the callback', () => {
        dispatcher.subscribe('test', ({}, cb) => cb(null, 'it works') || true);
        expect(() => dispatcher.dispatch('test')).to.throw(/already handled/);
      });

      it('when returning a value and calling reply', () => {
        dispatcher.subscribe('test', ({ reply }) => reply('it works') || true);
        expect(() => dispatcher.dispatch('test')).to.throw(/already handled/);
      });

      it('when calling reply and the callback', () => {
        dispatcher.subscribe('test', ({ reply }, cb) => {
          reply('it works');
          cb(null, 'it works');
        });

        expect(() => dispatcher.dispatch('test')).to.throw(/already handled/);
      });
    });
  });

  it('should throw an error when dispatching an invalid event', () => {
    expect(dispatcher.dispatch).to.throw(/you can only dispatch events of type string/i);
    expect(() => dispatcher.dispatch('')).to.throw(/not allowed to be empty/);
    expect(() => dispatcher.dispatch(Math.random())).to.throw();
    expect(() => dispatcher.dispatch(/test/)).to.throw();
    expect(() => dispatcher.dispatch('foo!bar')).to.throw();
  });

  it('should throw an error when calling an unregistered service', () => {
    const onResolve = sinon.spy();
    return dispatcher.dispatch('foo.bar').then(onResolve, (err) => {
      expect(err).to.exist();
      expect(err.message).to.equal('No subscribers registered for the foo.bar event.');
    }).then(() => {
      expect(onResolve).to.not.have.been.called();
    });
  });

  it('should call the hooks', () => {
    const before = sinon.spy();
    const after = sinon.spy();

    dispatcher.subscribe('test', () => 'bar');
    dispatcher.onBefore('test', before);
    dispatcher.onAfter('test', after);

    const promise = dispatcher.dispatch('test', 'foo');
    expect(before).to.have.been.calledOnce();
    expect(before).to.have.been.calledWith('foo');
    return promise.then(() => {
      expect(after).to.have.been.calledOnce();
      expect(after).to.have.been.calledWith('bar');
    });
  });

  it('should handle async / await', () => {
    dispatcher.subscribe('test2', () => 'works');

    dispatcher.subscribe('test1', async ({ dispatch }) => {
      const word = await dispatch('test2');
      return `it ${word}`;
    });

    return dispatcher.dispatch('test1').then((result) => {
      expect(result).to.equal('it works');
    });
  });

  it('should handle async / await errors', () => {
    dispatcher.subscribe('test', () => 'it works');

    dispatcher.subscribe('test', () => {
      throw new Error('not working');
    });

    dispatcher.subscribe('test', ({ next }) => next());

    return dispatcher.dispatch('test').catch((err) => {
      expect(err).to.exist();
      expect(err.message).to.equal('not working');
    });
  });

  it('should call the passed callbacks', () => {
    dispatcher.subscribe('test', (ev, cb) => {
      cb(null, 'it works');
    });

    return dispatcher.dispatch('test').then((result) => {
      expect(result).to.equal('it works');
    });
  });

  it('should call the dispatch callback with the thrown error', () => {
    dispatcher.subscribe('test', () => {
      throw new Error('not working');
    });

    dispatcher.subscribe('test', ({ params, next }) => next(params));

    return dispatcher.dispatch('test', {}, (err) => {
      expect(err).to.exist();
      expect(err.message).to.equal('not working');
    });
  });

  it('should be able to return a valid result using reply', () => {
    dispatcher.subscribe('test', ({ reply }) => reply('it works'));

    return dispatcher.dispatch('test').then((result) => {
      expect(result).to.equal('it works');
    });
  });

  it('should be able to return an error using reply', () => {
    dispatcher.subscribe('test', ({ reply }) => reply(new Error('nope, doesn\'t work!')));

    return dispatcher.dispatch('test').catch((err) => {
      expect(err.message).to.equal('nope, doesn\'t work!');
    });
  });

  it('should lookup namespaces', () => {
    dispatcher.subscribe('namespace.test', () => 'it works');

    const { test } = dispatcher.lookup('namespace');

    return test().then((result) => {
      expect(result).to.equal('it works');
    });
  });

  it('should handle errors', () => {
    dispatcher.subscribe('test', (ev, cb) => {
      cb(new Error('it doesn\'t work!'), 'it works');
    });

    dispatcher.on('error', (err) => {
      expect(err).to.be.an.instanceof(Error);
    });

    return dispatcher.dispatch('test').catch((err) => {
      expect(err).to.be.an.instanceof(Error);
      expect(err.message).to.equal('it doesn\'t work!');
    });
  });

  it('should send the parameters', () => {
    dispatcher.subscribe('test', ({ params }) => params);

    return dispatcher.dispatch('test', { hello: 'world' }).then((result) => {
      expect(result).to.deep.equal({ hello: 'world' });
    });
  });

  it('should validate the passed in parameters', () => {
    dispatcher.subscribe('test', ({ params }) => params, {
      schema: Joi.object({
        foo: Joi.any().valid('foo'),
      }).required(),
    });

    dispatcher.on('error', (err) => {
      expect(err).to.be.an.instanceof(Error);
    });

    return dispatcher.dispatch('test').catch((err) => {
      expect(err).to.be.an.instanceof(Error);
      expect(err.isJoi).to.be.true();
    });
  });

  it('should take into consideration the default parameters', () => {
    dispatcher.subscribe('test', ({ params }) => params, {
      defaultParams: {
        foo: 'bar',
      },
    });

    return dispatcher.dispatch('test').then((result) => {
      expect(result).to.deep.equal({
        foo: 'bar',
      });
    });
  });

  it('should be able to subscribe using regular expressions', () => {
    const pattern = /st$/;

    dispatcher.subscribe(/^te/, () => 'works');

    dispatcher.subscribe(pattern, async ({ next }) => `t ${await next()}`);

    dispatcher.subscribe(pattern, async ({ next }) => `i${await next()}`);

    return dispatcher.dispatch('test').then((result) => {
      expect(result).to.equal('it works');
    });
  });

  it('should be able to subscribe using an array event', () => {
    dispatcher.subscribe(['this', 'is', 'an', 'array'], () => 'it works');

    return dispatcher.dispatch('this.is.an.array').then((result) => {
      expect(result).to.equal('it works');
    });
  });

  it('should respect the order of regular expressions based susbcribers', () => {
    dispatcher.subscribe(/test/, ({ next, params }) => next(`${params} 3`));
    dispatcher.subscribe(/^test$/, ({ next, params }) => next(`${params} 2`));
    dispatcher.subscribe('test', ({ next, params }) => next(`${params} 5`));
    dispatcher.subscribe(/test/, ({ next, params }) => next(`${params} 1`));
    dispatcher.subscribe('test', ({ next, params }) => next(`${params} 4`));

    return dispatcher.dispatch('test', 0).then((result) => {
      expect(result.trim()).to.equal('0 1 2 3 4 5');
    });
  });

  it('should be handle the subscribers using priorities', () => {
    dispatcher.subscribe('test', ({ next, params }) => next(`${params} 4`), { priority: 100 });

    dispatcher.subscribe('test', ({ next, params }) => next(`${params} 3`));

    dispatcher.subscribe('test', ({ next, params }) => next(`${params} 5`), { priority: 5 });

    dispatcher.subscribe('test', ({ next, params }) => next(`${params} 2`), { priority: 1000 });

    dispatcher.subscribe('test', ({ next, params }) => next(`${params} 1`), { priority: 10000 });

    return dispatcher.dispatch('test', 0).then((result) => {
      expect(result.trim()).to.equal('0 1 2 3 4 5');
    });
  });

  it('should handle regular expressions with higher precedence than strings', () => {
    dispatcher.subscribe(/^test$/, ({ params, next }) => next(`${params || ''} first`));
    dispatcher.subscribe('test', ({ params, next }) => next(`${params || ''} second`));

    return dispatcher.dispatch('test').then((result) => {
      expect(result.trim()).to.equal('first second');
    });
  });

  it('should subscribe to a map of handlers', () => {
    const namespace = 'some.random.namespace';

    dispatcher.subscribeMap(`${namespace}.Something`, {
      foo({ dispatch, params = {} }) {
        return dispatch(`${namespace}.Something.bar`, Object.assign({}, params, {
          foo: true,
        }));
      },

      bar({ params = {} }) {
        return Object.assign({}, params, {
          bar: true,
        });
      },
    });

    const Something = dispatcher.lookup(`${namespace}.Something`);

    return Something.foo().then((result) => {
      expect(result).to.deep.equal({
        foo: true,
        bar: true,
      });
    });
  });

  it('should throw an error when subscribing with invalid handler', () => {
    const fn = () => {
      dispatcher.subscribe('test', 'not a function');
    };

    expect(fn).to.throw(/has to be a function/);
  });

  it('should unsubscribe all handlers for a specific event', () => {
    const subscriber1 = sinon.stub();
    const subscriber2 = sinon.stub();
    subscriber1.onCall(0).returns(true);
    subscriber2.onCall(0).returns(true);

    dispatcher.subscribe('test', subscriber1);
    const unsubscriber2 = dispatcher.subscribe(/test/, subscriber2);

    dispatcher.unsubscribe('test');
    unsubscriber2();

    return dispatcher.dispatch('test').then(() => {
      expect(subscriber1).to.not.have.been.called();
      expect(subscriber2).to.not.have.been.called();
    }, (err) => {
      expect(err).to.exist();
      expect(err.message).to.match(/No subscribers registered/);
    });
  });

  it('should unsubscribe only one handlers for a specific event', () => {
    const subscriber1 = sinon.stub();
    const subscriber2 = sinon.stub();
    subscriber1.onCall(0).returns(true);
    subscriber2.onCall(0).returns(true);

    dispatcher.subscribe('test', subscriber1);
    dispatcher.subscribe('test', ({ next }) => next(subscriber2()));

    dispatcher.unsubscribe('test', subscriber1);

    return dispatcher.dispatch('test').then(() => {
      expect(subscriber1).to.not.have.been.called();
      expect(subscriber2).to.have.been.called();
    }, (err) => {
      expect(err).not.to.exist();
    });
  });

  it('should be able to unsubscribe using the object returned by subscribeMap', () => {
    const unsubscribe = dispatcher.subscribeMap('Something', {
      foo() {
        return 'it works';
      },
    });

    const Something = dispatcher.lookup('Something');

    return Something.foo().then((result) => {
      expect(result).to.equal('it works');
      unsubscribe.foo();

      return Something.foo().catch((err) => {
        expect(err).to.exist();
        expect(err.message).to.match(/No subscribers registered/);
      });
    });
  });

  it('dispatch can work with callbacks', (done) => {
    dispatcher.subscribe('test', () => 'it works');

    dispatcher.dispatch('test', {}, (err, result) => {
      expect(err).to.be.null();
      expect(result).to.equal('it works');
      done();
    });
  });

  it('dispatch can handle callback errors', (done) => {
    dispatcher.subscribe('test', () => {
      throw new Error('meh');
    });

    dispatcher.subscribe('test', ({ next }) => next());

    dispatcher.dispatch('test', {}, (err) => {
      expect(err).to.be.an.instanceof(Error);
      expect(err.message).to.equal('meh');
      done();
    });
  });

  xit('should handle multiple regular expressions quite fast', () => {
    dispatcher.subscribe('test', () => 'it works');
    for (let i = 0; i < 1000; i++) {
      dispatcher.subscribe(/test/, ({ next }) => next());
      dispatcher.subscribe('test', ({ next }) => next());
    }

    dispatcher.dispatch('test').then((result) => {
      expect(result).to.equal('it works');
    });
  });

  it('should proxy events', () => {
    dispatcher.subscribe('test', () => 'it works');
    dispatcher.proxy('proxyTest', 'test');
    return dispatcher.dispatch('proxyTest').then((result) => {
      expect(result).to.equal('it works');
    });
  });

  it('should proxy events and pass the parameters', () => {
    dispatcher.subscribe('test', ({ params }) => `${params}!`);
    dispatcher.proxy('proxyTest', 'test');
    return dispatcher.dispatch('proxyTest', 'it works').then((result) => {
      expect(result).to.equal('it works!');
    });
  });

  it('should proxy events and transform the parameters', () => {
    dispatcher.subscribe('test', ({ params }) => `${params}!`);
    dispatcher.proxy('proxyTest', 'test', (params) => `${params}!!`);
    return dispatcher.dispatch('proxyTest', 'it works').then((result) => {
      expect(result).to.equal('it works!!!');
    });
  });
});
