var express = require('express');
var bodyParser = require('body-parser');
var expressValidator = require('express-validator');
var multer  = require('multer');

var app = express();

app.use(bodyParser.json({ type: 'application/json' }));
app.use(expressValidator());
app.set('views', './views');
app.set('view engine', 'ejs');

var postgres = require('./lib/postgres');

function lookupRestaurant(req, res, next) {
  var restaurantId = req.params.id;
  console.log(req.params.id);
  var sql = 'SELECT * FROM restaurants WHERE restaurantid = $1';
  postgres.client.query(sql, [ restaurantId ], function(err, results) {
    if (err) {
      console.error(err);
      res.statusCode = 500;
      return res.json({ errors: ['Could not retrieve restaurant'] });
    }
    if (results.rows.length === 0) {
      res.statusCode = 404;
      return res.json({ errors: ['Restaurant not found']});
    }

    req.restaurant = results.rows[0];
    next();
  });
}

function validateRestaurant(req, res, next) {
  if (!req.files.restaurant) {
    res.statusCode = 400;
    return res.json({
      errors: ['File failed to upload']
    });
  }
  if (req.files.photo.truncated) {
    res.statusCode = 400;
    return res.json({
      errors: ['File too large']
    });
  }

  req.checkBody('description', 'Invalid description').notEmpty();
  req.checkBody('album_id', 'Invalid album_id').isNumeric();

  var errors = req.validationErrors();
  if (errors) {
    var response = { errors: [] };
    errors.forEach(function(err) {
      response.errors.push(err.msg);
    });

    res.statusCode = 400;
    return res.json(response);
  }

  return next();
}

var restaurantRouter = express.Router();

restaurantRouter.get('/', function(req, res) {
  var page = parseInt(req.query.page, 10);
  if (isNaN(page) || page < 1) {
    page = 1;
  }

  var limit = parseInt(req.query.limit, 10);
  if (isNaN(limit)) {
    limit = 10;
  } else if (limit > 50) {
    limit = 50;
  } else if (limit < 1) {
    limit = 1;
  }

  var sql = 'SELECT count(1) FROM restaurants';
  postgres.client.query(sql, function(err, result) {
    if (err) {
      console.error(err);
      res.statusCode = 500;
      return res.json({
        errors: ['Could not retrieve restaurants']
      });
    }

    var count = parseInt(result.rows[0].count, 10);
    var offset = (page - 1) * limit;

    sql = 'SELECT * FROM restaurants OFFSET $1 LIMIT $2';
    postgres.client.query(sql, [offset, limit], function(err, result) {
      if (err) {
        console.error(err);
        res.statusCode = 500;
        return res.json({
          errors: ['Could not retrieve restaurants']
        });
      }

      return res.json(result.rows);
    });
  });
});

restaurantRouter.post('/', multer({
  dest: './uploads/',
  rename: function(field, filename) {
    filename = filename.replace(/\W+/g, '-').toLowerCase();
    return filename + '_' + Date.now();
  },
  limits: {
    files: 1,
    fileSize: 2 * 1024 * 1024,
  }
}), validateRestaurant, function(req, res) {
  var sql = 'INSERT INTO photo (description, filepath, album_id) VALUES ($1,$2,$3) RETURNING id';
  var data = [
    req.body.description,
    req.files.photo.path,
    req.body.album_id
  ];
  postgres.client.query(sql, data, function(err, result) {
    if (err) {
      console.error(err);
      res.statusCode = 500;
      return res.json({
        errors: ['Could not create restaurant']
      });
    }

    var photoId = result.rows[0].id;
    var sql = 'SELECT * FROM photo WHERE id = $1';
    postgres.client.query(sql, [ photoId ], function(err, result) {
      if (err) {
        console.error(err);
        res.statusCode = 500;
        return res.json({ errors: ['Could not retrieve restaurant after create'] });
      }

      res.statusCode = 201;
      res.json(result.rows[0]);
    });
  });
});
restaurantRouter.get('/:id([0-9]+)', lookupRestaurant, function(req, res) {
  res.json(req.restaurant);
});
restaurantRouter.patch('/:id([0-9]+)', function(req, res) { });
app.use('/restaurant', restaurantRouter);

var uploadRouter = express.Router();
uploadRouter.get('/', function(req, res) {
  res.render('form');
});
app.use('/upload', uploadRouter);

module.exports = app;
