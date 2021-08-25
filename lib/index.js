const get = require('lodash.get');
const {
  applyConditionsToQuery,
  generateCursorStr,
  parseCursorStr,
  transformCursorIntoConditions,
} = require('./utils');

const createCursorObj = (lastResult, sort) => {
  return Object.keys(sort).reduce((result, sortKey) => {
    result[sortKey] = get(lastResult, sortKey);
    return result;
  }, {});
};

module.exports = (schema, { defaultLimit = 100 } = {}) => {
  // Custom query .exec that wraps the results in an object,
  // determines the pagination data, and returns the wrapped
  // object.
  const newExec = async function (_origExec, ...args) {
    const query = this;
    let results = await _origExec.call(this, ...args);

    const totalCount = await query.mongooseCollection.countDocuments(
      query._conditions
    );

    // Currently this plugin doesn't handle full-text search pagination
    if (query.__paginationPlugin.isFullTextSearchQuery) {
      return {
        results,
        pageInfo: { hasNextPage: null, startCursor: null, nextCursor: null },
      };
    }

    const { limit, sort } = query.options;
    const { after } = query.__paginationPlugin;
    const origLimit = limit - 1;
    const hasNextPage = results.length > origLimit;
    const hasPreviousPage = !!after;

    results = results.map((v) => {
      const nextCursorObj = createCursorObj(v, sort);
      return {
        cursor: generateCursorStr(nextCursorObj),
        node: v,
      };
    });

    let startCursor = results.length ? results[0].cursor : null,
      nextCursor = null;

    if (hasNextPage) {
      results.pop();
      const lastResult = results[results.length - 1];
      nextCursor = lastResult.cursor;
    }

    return {
      totalCount,
      results,
      pageInfo: { hasNextPage, hasPreviousPage, startCursor, nextCursor },
    };
  };

  // Query Helper
  schema.query.paginate = function (after = undefined, before = undefined) {
    const query = this;
    if (query.op !== 'find') {
      throw new Error('Cannot paginate on any operations other than find');
    }

    query.__paginationPlugin = { after, before };

    // Replace the .exec fn with our custom exec
    const origExec = query.exec;
    query.exec = newExec.bind(query, origExec);
    return query;
  };

  schema.pre('find', function () {
    const query = this;
    if (typeof query.__paginationPlugin === 'object') {
      const { limit, sort = {} } = query.options;

      // Check if one of our cursor fields corresponds to a text-search score
      // This plugin doesn't current handle search
      if (Object.prototype.hasOwnProperty.call(query.getQuery(), '$text')) {
        query.__paginationPlugin.isFullTextSearchQuery = true;
        return;
      }

      // Ensure a limit has been set // and increase the limit by 1
      query.setOptions({
        limit: limit ? limit + 1 : defaultLimit + 1,
      });

      // Ensure there is a sort key - default is _id
      if (Object.keys(sort).length === 0) {
        query.sort('_id');
      }

      // If _id is not already part of the sort key, add it
      // to ensure unique cursors
      if (!Object.keys(sort).includes('_id')) {
        query.sort({ ...sort, _id: 1 });
      }

      // after Cursor
      const { after } = query.__paginationPlugin;
      if (after) {
        const cursorObj = parseCursorStr(after, schema);
        const cursorConditions = transformCursorIntoConditions({
          cursorObj,
          sortObj: sort,
        });

        // Apply the cursor conditions
        // This gets tricky if the sort key has more than one field,
        // and more so if there's already $or/$and conditions
        // in the query.
        applyConditionsToQuery(cursorConditions, query);
      }

      // before Cursor
      const { before } = query.__paginationPlugin;
      if (before) {
        const cursorObj = parseCursorStr(before, schema);
        const cursorConditions = transformCursorIntoConditions({
          cursorObj,
          sortObj: sort,
        });

        // Apply the cursor conditions
        // This gets tricky if the sort key has more than one field,
        // and more so if there's already $or/$and conditions
        // in the query.
        applyConditionsToQuery(cursorConditions, query);
      }
    }
  });
};
