import base64url from 'base64-url';
import mongoose from 'mongoose';

// We generate a base64-encoded JSON string
export const generateCursorStr = (cursorObj: { [x: string]: any }) => {
  const simplifiedCursorObj = Object.keys(cursorObj).reduce(
    (result, cursorKey) => {
      const val = cursorObj[cursorKey];

      // This could be made more modular in the future if there
      // is a need to serialize other types.
      if (typeof val === 'object' && mongoose.Types.ObjectId.isValid(val)) {
        // Although this will be rehydrated as a string later on, mongoose
        // will automatically convert strings to ids when querying.
        result[cursorKey] = val.toString();
      } else if (val instanceof Date) {
        result[cursorKey] = val.getTime();
      } else if (typeof val !== 'object' || val === null) {
        result[cursorKey] = val;
      }

      return result;
    },
    {}
  );

  return base64url.encode(JSON.stringify(simplifiedCursorObj));
};

export const parseCursorStr = (
  cursorStr: any,
  schema: {
    query?: { paginate: (after?: undefined, before?: undefined) => any };
    pre?: (arg0: string, arg1: () => void) => void;
    path?: any;
  }
) => {
  const cursorPlainText = base64url.decode(cursorStr);
  const cursorObj = JSON.parse(cursorPlainText);

  Object.keys(cursorObj).forEach((cursorKey) => {
    // This could be made more modular in the future if there
    // is a need to hydrate other types.
    const schemaPath = schema.path(cursorKey);
    if (typeof schemaPath === 'object' && schemaPath.instance === 'ObjectID') {
      cursorObj[cursorKey] = new mongoose.Types.ObjectId(cursorObj[cursorKey]);
    } else if (
      typeof schemaPath === 'object' &&
      schemaPath.instance === 'Date'
    ) {
      cursorObj[cursorKey] = new Date(cursorObj[cursorKey]);
    }
  });

  return cursorObj;
};

export const transformCursorIntoConditions = ({
  cursorObj = {},
  sortObj = {},
}) => {
  const cursorKeys = Object.keys(cursorObj);
  const sortKeys = Object.keys(sortObj);
  if (!cursorKeys.every((key) => sortKeys.includes(key))) {
    throw new Error('Cursor keys must be a subset of sort keys');
  }

  // Create a new array that will contain our query conditions
  // for cursor offsets, then initialize the array
  // with empty objects.
  const cursorConditions = new Array(cursorKeys.length);
  for (let i = 0; i < cursorKeys.length; i += 1) {
    cursorConditions[i] = {};
  }

  for (let i = 0; i < cursorKeys.length; i += 1) {
    const comparisonOperator = sortObj[cursorKeys[i]] === -1 ? '$lt' : '$gt';

    cursorConditions[i][cursorKeys[i]] = {
      [comparisonOperator]: cursorObj[cursorKeys[i]],
    };

    for (let j = i + 1; j < cursorKeys.length; j += 1) {
      cursorConditions[j][cursorKeys[i]] = cursorObj[cursorKeys[i]];
    }
  }

  return cursorConditions;
};

export const applyConditionsToQuery = (
  cursorConditions = [],
  query: {
    where: (arg0: any) => void;
    getQuery: () => any;
    setQuery: (arg0: any) => void;
    _conditions: { $or: any };
  }
) => {
  if (cursorConditions.length === 1) {
    query.where(cursorConditions[0]);
  } else if (cursorConditions.length > 1) {
    const queryConditions = query.getQuery();
    if (Array.isArray(queryConditions.$or)) {
      if (Array.isArray(queryConditions.$and)) {
        query.where({
          $and: [
            ...queryConditions.$and,
            { $or: queryConditions.$or },
            { $or: cursorConditions },
          ],
        });
      } else {
        query.where({
          $and: [{ $or: queryConditions.$or }, { $or: cursorConditions }],
        });
      }

      // Get rid of stray $or
      // `setQuery` introduced in mongoose 5.2.9
      if (typeof query.setQuery === 'function') {
        const newQueryConditions = query.getQuery();
        delete newQueryConditions.$or;
        query.setQuery(newQueryConditions);
      } else {
        // The legacy way
        // TODO: Remove this at some point
        delete query._conditions.$or;
      }
    } else {
      query.where({ $or: cursorConditions });
    }
  }

  return query;
};
