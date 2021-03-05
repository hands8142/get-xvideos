var cheerio = require("cheerio"),
    http = require("https"),
    qs = require("querystring"),
    url = require("url");

var XVideos = module.exports;

XVideos.resolveId = function resolveId(id, cb) {
  if (typeof id !== "number") {
    return cb(Error("wrong type for id; expected number but got " + typeof id));
  }

  var req = http.get("https://www.xvideos.com/video" + id, function(res) {
    if (res.statusCode === 404) {
      return cb(Error("video not found"));
    }

    if (res.statusCode !== 301) {
      return cb(Error("incorrect status code; expected 301 but got " + res.statusCode));
    }

    return cb(null, res.headers.location);
  });

  req.once("error", cb);
};

XVideos.details = function details(url, cb) {
  var req = http.get(url, function(res) {
    var body = Buffer(0);

    res.on("readable", function() {
      var chunk;
      while (chunk = res.read()) {
        body = Buffer.concat([body, chunk]);
      }
    });

    if (res.statusCode === 404) {
      return cb(Error("video not found"));
    }

    if (res.statusCode !== 200) {
      return cb(Error("incorrect status code; expected 200 but got " + res.statusCode));
    }

    res.on("end", function() {
      body = body.toString("utf8");

      var $ = cheerio.load(body);

      var title = $("#main > h2").text().replace(/-[^-]+$/, "").trim();

      var tags = $(".video-tags-list li").map(function(i, e) {
        return $(e).text().trim();
      }).toArray().filter(function(e) {
        return e !== "more tags";
      }).filter(function(e) {
        return e !== "+";
      });

      var duration = $(".duration").text().trim().replace(/^-/, "").trim();

      var player = $("#video-player-bg");
      var urls = {};

      var thumb;
      if (player) {
        urls.low = body.match(/html5player.setVideoUrlLow\(\'(.*)\'\);/) ? body.match(/html5player.setVideoUrlLow\(\'(.*)\'\);/)[1] : null;
        urls.high = body.match(/html5player.setVideoUrlHigh\(\'(.*)\'\);/) ? body.match(/html5player.setVideoUrlHigh\(\'(.*)\'\);/)[1] : null;
        urls.hls = body.match(/html5player.setVideoHLS\(\'(.*)\'\);/) ? body.match(/html5player.setVideoHLS\(\'(.*)\'\);/)[1] : null;
        thumb = body.match(/html5player.setThumbSlide\(\'(.*)\'\);/)[1];
      } else {
        return cb(Error("couldn't find player"));
      }


      return cb(null, {title, duration, tags, urls, thumb});
    });
  });

  req.once("error", cb);
};

XVideos.constructSearchUrl = function constructSearchUrl(parameters) {
  return "https://www.xvideos.com/?" + qs.stringify(parameters);
};

XVideos.search = function search(parameters, cb) {
  var req = http.get(this.constructSearchUrl(parameters), function(res) {
    var body = Buffer(0);

    res.on("readable", function() {
      var chunk;
      while (chunk = res.read()) {
        body = Buffer.concat([body, chunk]);
      }
    });

    if (res.statusCode !== 200) {
      return cb(Error("incorrect status code; expected 200 but got " + res.statusCode));
    }

    res.on("end", function() {
      body = body.toString("utf8");

      var $ = cheerio.load(body);

      var videos = $(".thumb-block").map(function (i, e) {
        var href = $(e).toString().match(/href=\"([^\"]*)\"/)[1];
        var thumb = $(e).toString().match(/data-src=\"([^\"]*)\"/)[1];
        var title = $(e).toString().match(/title=\"([^\"]*)\"/)[1];

        return {
          url: url.resolve("https://www.xvideos.com/", href.replace("/THUMBNUM/", "/")),
          thumb: thumb.replace(/THUMBNUM/, "1"),
          title: title,
          duration: $(e).find("span.duration").text().replace(/[\(\)]/g, "").trim()
        };
      });

      var total = parseInt($("h4.bg-title").text().replace(/[\r\n]/g, " ").replace(/^.*[-]\s*([\d,]*) results.*$/, "$1").replace(",", ""), 10);

      return cb(null, {total, videos: videos.toArray()});
    });
  });

  req.once("error", cb);
};