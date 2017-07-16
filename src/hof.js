import Joi from 'joi';
import memoize from 'lodash/memoize';
import isPlainObject from 'lodash/isPlainObject';

export const withDefaults = defaults => handler => args => {
  const { data } = args.message;
  const isMergeable = isPlainObject(defaults) && isPlainObject(data);
  const finalData = isMergeable ? { ...defaults, ...data } : data || defaults;

  Object.assign(args.message, {
    data: finalData,
  });

  return handler(args);
};

export const withSchema = schema => handler => args => {
  const { data } = args.message;
  const validData = Joi.attempt(data, schema);

  Object.assign(args.message, {
    data: validData,
  });

  return handler(args);
};

export const withResultSchema = schema => handler => args =>
  Promise.resolve(handler(args)).then(result => Joi.attempt(result, schema));

export const withExtracts = extracts => handler => args => {
  const { extract } = args;

  const pins = Object.keys(extracts).reduce(
    (acc, key) => ({
      ...acc,
      [key]: extract(extracts[key]),
    }),
    {}
  );

  return handler({
    ...args,
    ...pins,
  });
};

export const withData = handler => (args, cb) => {
  const data = isPlainObject(args.message.data) ? args.message.data : {};

  return handler(
    {
      ...data,
      ...args,
    },
    cb
  );
};

export const withMemoization = handler => memoize(handler, ({ message }) => message.data);
