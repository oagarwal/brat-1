// make JS debugger-friendly
if (typeof(console) === 'undefined') {
  var console = {};
  console.log = console.error = console.info = console.debug =
      console.warn = console.trace = console.dir = console.dirxml =
      console.group = console.groupEnd = console.time =
      console.timeEnd = console.assert = console.profile =
      function() {};
}

// SVG Annotation tool
var Annotator = function(containerElement, onStart) {
  var undefined; // prevent evil

  if (!Annotator.count) Annotator.count = 0;
  var id = Annotator.count;
  this.variable = "Annotator[" + id + "]";
  var annotator = Annotator[Annotator.count] = this;
  Annotator.count++;

  containerElement = $(containerElement);

  // settings
  var margin = { x: 2, y: 1 };
  var space = 5;
  var boxSpacing = 3;
  var curlyHeight = 6;
  var lineSpacing = 5;
  var arcSpacing = 10;
  var arcSlant = 20;
  var arcStartHeight = 35;
  var arcHorizontalSpacing = 75;

  var canvasWidth;
  var svg;
  var svgElement;
  var data;

  var highlight;
  var highlightArcs;

  var mouseOver = function(evt) {
    var target = $(evt.target);
    var id;
    console.log(target);
    if (id = target.attr('data-span-id')) {
      console.log(id);
      var span = data.spans[id];
      highlight = svg.rect(span.chunk.highlightGroup,
        span.curly.from - 1, span.curly.y - 1,
        span.curly.to + 2 - span.curly.from, span.curly.height + 2,
        { 'class': 'span_default span_' + span.type });
      highlightArcs = target.closest('svg').find('.arcs').
          find('g[data-from="' + id + '"], g[data-to="' + id + '"]');
      highlightArcs.addClass('highlight');
      console.log(highlightArcs);
    }
  };

  var mouseOut = function(evt) {
    if (highlight) {
      svg.remove(highlight);
      highlight = null;
    }
    if (highlightArcs) {
      highlightArcs.removeClass('highlight');
      highlightArcs = null;
    }
  };

  var click = function(evt) {
    // DEBUG
    var target = $(evt.target);
    var id;
    if (id = target.attr('data-span-id')) {
      var span = data.spans[id];
      console.log(span); // DEBUG
    }
  }

  this.drawInitial = function(_svg) {
    svg = _svg;
    svgElement = $(svg._svg);
    if (onStart) onStart.call(annotator);

    containerElement.mouseover(mouseOver);
    containerElement.mouseout(mouseOut);
    containerElement.click(click);
  }

  var Span = function(id, type, from, to) {
    this.id = id;
    this.type = type;
    this.from = from;
    this.to = to;
    this.outgoing = [];
    this.incoming = [];
    this.totalDist = 0;
    this.numArcs = 0;
  }

  // event is reserved
  var EventDesc = function(id, triggerId, roles) {
    this.id = id;
    this.triggerId = triggerId;
    var roleList = this.roles = [];
    $.each(roles, function(roleNo, role) {
      roleList.push({ type: role[0], targetId: role[1] });
    });
  }

  var setData = function(_data) {
    if (!_data) return;
    data = _data;

    // collect annotation data
    data.spans = {};
    $.each(data.entities, function(entityNo, entity) {
      var span =
          new Span(entity[0], entity[1], entity[2], entity[3]);
      data.spans[entity[0]] = span;
    });
    var triggerHash = {};
    $.each(data.triggers, function(triggerNo, trigger) {
      triggerHash[trigger[0]] =
          new Span(trigger[0], trigger[1], trigger[2], trigger[3]);
    });
    data.eventDescs = {};
    $.each(data.events, function(eventNo, eventRow) {
      var eventDesc = data.eventDescs[eventRow[0]] =
          new EventDesc(eventRow[0], eventRow[1], eventRow[2]);
      var span = $.extend({}, triggerHash[eventDesc.triggerId]); // clone
      span.id = eventDesc.id;
      data.spans[eventDesc.id] = span;
    });
    $.each(data.modifications, function(modNo, mod) {
      data.spans[mod[2]][mod[1]] = true;
    });

    // find chunk breaks
    var breaks = [[-1, false]];
    var pos = -1;
    while ((pos = data.text.indexOf('\n', pos + 1)) != -1) {
      breaks.push([pos, true]);
    }
    pos = -1;
    while ((pos = data.text.indexOf(' ', pos + 1)) != -1) {
      var wordBreak = true;
      // possible word break: see if it belongs to any spans
      $.each(data.spans, function(spanNo, span) {
        if (span.from <= pos + data.offset && pos + data.offset < span.to) {
          // it does; no word break
          wordBreak = false;
          return false;
        }
      });
      if (wordBreak) breaks.push([pos, false]);
    }
    breaks.sort(function(a, b) { return a[0] - b[0] });

    // split text into chunks
    // format: data.chunks[chunk] = [text, from, to, lineBreak, [spans]]
    data.chunks = [];
    var numBreaks = breaks.length;
    breaks.push([data.text.length, false]);
    var chunkNo = 0;
    for (var breakNo = 0; breakNo < numBreaks; breakNo++) {
      var from = breaks[breakNo][0] + 1;
      var to = breaks[breakNo + 1][0];
      if (from != to) {
        data.chunks.push({
            text: data.text.substring(from, to),
            from: from + data.offset,
            to: to + data.offset,
            lineBreak: breaks[breakNo][1],
            index: chunkNo++,
            spans: [],
          });
      }
    }

    // assign spans to appropriate chunks
    var numChunks = data.chunks.length;
    for (spanId in data.spans) {
      var span = data.spans[spanId];
      for (var j = 0; j < numChunks; j++) {
        var chunk = data.chunks[j];
        if (span.to <= chunk.to) {
          chunk.spans.push(span);
          span.chunk = chunk;
          break; // chunks
        }
      }
    }
   
    // assign arcs to spans; calculate arc distances
    data.arcs = [];
    $.each(data.eventDescs, function(eventNo, eventDesc) {
      var dist = 0;
      var origin = data.spans[eventDesc.id];
      var here = origin.chunk.index;
      $.each(eventDesc.roles, function(roleNo, role) {
        var target = data.spans[role.targetId];
        var there = target.chunk.index;
        var dist = Math.abs(here - there);
        var arc = {
          origin: eventDesc.id,
          target: role.targetId,
          dist: dist,
          type: role.type,
          jumpHeight: 0,
        };
        origin.totalDist += dist;
        origin.numArcs++;
        target.totalDist += dist;
        target.numArcs++;
        data.arcs.push(arc);
        // TODO: do we really need incoming and outgoing, if we have
        // totalDist?
        target.incoming.push(arc);
        origin.outgoing.push(arc);
      });
    });

    // sort spans in chunks
    data.spanLine = [];
    var spanNo = -1;
    var lastSpan = null;
    $.each(data.chunks, function(chunkNo, chunk) {
      $.each(chunk.spans, function(spanNo, span) {
        span.avgDist = span.totalDist / span.numArcs;
      });
      chunk.spans.sort(function(a, b) {
        // longer arc distances go last
        var tmp = a.avgDist - b.avgDist;
        if (tmp) {
          return tmp < 0 ? -1 : 1;
        }
        // if arc widths same, compare the span widths,
        // put wider on bottom so they don't mess with arcs
        var ad = a.to - a.from;
        var bd = b.to - b.from;
        tmp = ad - bd;
        if (tmp) {
          return tmp < 0 ? 1 : -1;
        }
        // lastly, all else being equal, earlier-starting ones go first
        tmp = a.from != b.from;
        if (tmp) {
          return tmp < 0 ? -1 : 1;
        }
        return 0;
      });
      // number the spans so we can check for heights later
      $.each(chunk.spans, function(i, span) {
        if (!lastSpan || (lastSpan.from != span.from || lastSpan.to != span.to)) {
          spanNo++;
          data.spanLine[spanNo] = []
          span.drawCurly = true;
        }
        data.spanLine[spanNo].push(span);
        span.lineIndex = spanNo;
        lastSpan = span;
      });
    });
  }

  var placeReservation = function(span, box, reservations) {
    var newSlot = {
      from: box.x,
      to: box.x + box.width,
      span: span,
      height: box.height + (span.drawCurly ? curlyHeight : 0),
    };
    var height = 0;
    if (reservations.length) {
      $.each(reservations, function(resNo, reservation) {
        var line = reservation.ranges;
        height = reservation.height;
        var overlap = false;
        $.each(line, function(j, slot) {
          if (slot.from <= newSlot.to && newSlot.from <= slot.to) {
            overlap = true;
            return false;
          }
        });
        if (!overlap) {
          if (!reservation.curly && span.drawCurly) {
            // TODO: need to push up the boxes drawn so far
            // (rare glitch)
          }
          line.push(newSlot);
          return height;
        }
      });
      height += newSlot.height + boxSpacing; 
    }
    reservations.push({
      ranges: [newSlot],
      height: height,
      curly: span.drawCurly,
    });
    return height;
  }

  var translate = function(element, x, y) {
    $(element.group).attr('transform', 'translate(' + x + ', ' + y + ')');
    element.translation = { x: x, y: y };
  }

  var Row = function() {
    this.group = svg.group();
    this.chunks = [];
  }

  var rowBBox = function(span) {
    var box = span.rect.getBBox();
    var chunkTranslation = span.chunk.translation;
    box.x += chunkTranslation.x;
    box.y += chunkTranslation.y;
    return box;
  }

  this.renderData = function(_data) {
    setData(_data);
    svg.clear();
    if (!data || data.length == 0) return;
    canvasWidth = $(containerElement).width();
    $(svg).attr('width', canvasWidth);
    
    var current = { x: margin.x, y: margin.y };
    var lastNonText = { chunkInRow: -1, rightmostX: 0 }; // TODO textsqueeze
    var rows = [];
    var spanHeights = [];
    var row = new Row();
    row.index = 0;
    var rowIndex = 0;
    var textHeight;
    var reservations;

    $.each(data.chunks, function(chunkNo, chunk) {
      reservations = new Array();
      chunk.group = svg.group(row.group);

      // a group for text highlight below the text
      chunk.highlightGroup = svg.group(chunk.group);

      var chunkText = svg.text(chunk.group, 0, 0, chunk.text);
      if (!textHeight) {
        textHeight = chunkText.getBBox().height;
      }
      var y = 0;
      var chunkIndexFrom, chunkIndexTo;
      var minArcDist;
      var lastArcBorder = 0;
      var hasLeftArcs, hasRightArcs;

      $.each(chunk.spans, function(spanNo, span) {
        span.chunk = chunk;
        span.group = svg.group(chunk.group, {
          'class': 'span',
        });

        // measure the text span
        var measureText = svg.text(chunk.group, 0, 0,
          chunk.text.substr(0, span.from - chunk.from));
        var xFrom = measureText.getBBox().width;
        svg.remove(measureText);
        measureText = svg.text(chunk.group, 0, 0,
          chunk.text.substr(0, span.to - chunk.from));
        var measureBox = measureText.getBBox();
        if (!y) y = -textHeight - curlyHeight;
        var xTo = measureBox.width;
        span.curly = {
          from: xFrom,
          to: xTo,
          y: measureBox.y,
          height: measureBox.height,
        };
        svg.remove(measureText);
        var x = (xFrom + xTo) / 2;

        var spanText = svg.text(span.group, x, y, span.type);
        var spanBox = spanText.getBBox();
        svg.remove(spanText);
        var dasharray = span.Speculation ? '3, 3' : 'none';
        span.rect = svg.rect(span.group,
          spanBox.x - margin.x,
          spanBox.y - margin.y,
          spanBox.width + 2 * margin.x,
          spanBox.height + 2 * margin.y, {
            'class': 'span_' + span.type + ' span_default',
            rx: margin.x,
            ry: margin.y,
            'data-span-id': span.id,
            'strokeDashArray': dasharray,
          });
        var rectBox = span.rect.getBBox();

        if (chunkIndexFrom == undefined || chunkIndexFrom > span.lineIndex)
          chunkIndexFrom = span.lineIndex;
        if (chunkIndexTo == undefined || chunkIndexTo < span.lineIndex)
          chunkIndexTo = span.lineIndex;
        var yAdjust = placeReservation(span, rectBox, reservations);
        // this is monotonous due to sort:
        span.height = yAdjust + spanBox.height + 3 * margin.y + curlyHeight + arcSpacing;
        spanHeights[span.lineIndex * 2] = span.height;
        $(span.rect).attr('y', spanBox.y - margin.y - yAdjust);
        $(spanText).attr('y', y - yAdjust);
        if (span.Negation) {
          svg.path(span.group, svg.createPath().
              move(spanBox.x, spanBox.y - margin.y - yAdjust).
              line(spanBox.x + spanBox.width,
                spanBox.y + spanBox.height + margin.y - yAdjust),
              { 'class': 'negation' });
          svg.path(span.group, svg.createPath().
              move(spanBox.x + spanBox.width, spanBox.y - margin.y - yAdjust).
              line(spanBox.x, spanBox.y + spanBox.height + margin.y - yAdjust),
              { 'class': 'negation' });
        }
        svg.add(span.group, spanText);

        // Make curlies to show the span
        if (span.drawCurly) {
          var bottom = spanBox.y + spanBox.height + margin.y - yAdjust;
          svg.path(span.group, svg.createPath()
              .move(xFrom, bottom + curlyHeight)
              .curveC(xFrom, bottom,
                x, bottom + curlyHeight,
                x, bottom)
              .curveC(x, bottom + curlyHeight,
                xTo, bottom,
                xTo, bottom + curlyHeight),
            {
          });
        }

        // find the last arc backwards
        $.each(span.incoming, function(arcId, arc) {
          var origin = data.spans[arc.origin].chunk;
          if (origin.row) {
            hasLeftArcs = true;
            if (origin.row.index == rowIndex) {
              // same row, but before this
              var border = origin.translation.x + origin.box.x + origin.box.width;
              if (!lastArcBorder || border > lastArcBorder)
                lastArcBorder = border;
            }
          } else {
            hasRightArcs = true;
          }
        });
        $.each(span.outgoing, function(arcId, arc) {
          var target = data.spans[arc.target].chunk;
          if (target.row) {
            hasLeftArcs = true;
            if (target.row.index == rowIndex) {
              // same row, but before this
              var border = target.translation.x + target.box.x + target.box.width;
              if (!lastArcBorder || border > lastArcBorder)
                lastArcBorder = border;
            }
          } else {
            hasRightArcs = true;
          }
        });
      }); // spans

      var len = chunkIndexTo * 2;
      for (var i = chunkIndexFrom * 2 + 1; i < len; i++)
        spanHeights[i] = Math.max(spanHeights[i - 1], spanHeights[i + 1]);

      // positioning of the chunk
      var chunkBox = chunk.group.getBBox();
      chunk.box = chunkBox;
      if (lastArcBorder) {
        var spacing = arcHorizontalSpacing - (current.x - lastArcBorder);
        // arc too small?
        if (spacing > 0) current.x += spacing;
      }
      var rightBorderForArcs = hasRightArcs ? arcHorizontalSpacing : 0;
      if (chunk.lineBreak
          || current.x + chunkBox.width + rightBorderForArcs >= canvasWidth - 2 * margin.x) {
        row.arcs = svg.group(row.group, { class: 'arcs' });
        // new row
        rows.push(row);
        current.x = margin.x + (hasLeftArcs ? arcHorizontalSpacing : 0);
        svg.remove(chunk.group);
        lastNonText = { chunkInRow: -1, rightmostX: 0 }; // TODO textsqueeze
        row = new Row();
        row.index = ++rowIndex;
        svg.add(row.group, chunk.group);
        chunk.group = row.group.lastElementChild;
        $(chunk.group).children("g[class='span']").
          each(function(index, element) {
              chunk.spans[index].group = element;
          });
        $(chunk.group).find("rect").
          each(function(index, element) {
              chunk.spans[index].rect = element;
          });
        chunk.highlightGroup = chunk.group.firstElementChild;
      }
      row.chunks.push(chunk);
      chunk.row = row;
      translate(chunk, current.x - chunkBox.x, 0);

      current.x += chunkBox.width + space;
    }); // chunks

    // finish the last row
    row.arcs = svg.group(row.group, { class: 'arcs' });
    rows.push(row);

    var defs = svg.defs();
    var arrows = {};

    var len = spanHeights.length;
    for (var i = 0; i < len; i++) {
      if (!spanHeights[i] || spanHeights[i] < arcStartHeight) spanHeights[i] = arcStartHeight;
    }

    // find out how high the arcs have to go
    $.each(data.arcs, function(arcNo, arc) {
      arc.jumpHeight = 0;
      var from = data.spans[arc.origin].lineIndex;
      var to = data.spans[arc.target].lineIndex;
      if (from > to) {
        var tmp = from; from = to; to = tmp;
      }
      for (var i = from + 1; i < to; i++) {
        if (arc.jumpHeight < spanHeights[i * 2]) arc.jumpHeight = spanHeights[i * 2];
      }
    });

    // sort the arcs
    data.arcs.sort(function(a, b) {
      // first write those that have less to jump over
      var tmp = a.jumpHeight - b.jumpHeight;
      if (tmp) return tmp < 0 ? -1 : 1;
      // if equal, then those that span less distance
      tmp = a.dist - b.dist;
      if (tmp) return tmp < 0 ? -1 : 1;
      // if equal, then those where heights of the targets are smaller
      tmp = data.spans[a.origin].height + data.spans[a.target].height -
        data.spans[b.origin].height - data.spans[b.target].height;
      if (tmp) return tmp < 0 ? -1 : 1;
      // if equal, then those with the lower origin
      tmp = data.spans[a.origin].height - data.spans[b.origin].height;
      if (tmp) return tmp < 0 ? -1 : 1;
      // if equal, they're just equal.
      return 0;
    });

    // add the arcs
    $.each(data.arcs, function(arcNo, arc) {
      roleClass = 'role_' + arc.type;

      if (!arrows[arc.type]) {
        var arrowId = 'annotator' + id + '_arrow_' + arc.type;
        var arrowhead = svg.marker(defs, arrowId,
          5, 2.5, 5, 5, 'auto',
          {
            markerUnits: 'strokeWidth',
            'class': 'fill_' + arc.type,
          });
        svg.polyline(arrowhead, [[0, 0], [5, 2.5], [0, 5], [0.2, 2.5]]);

        arrows[arc.type] = arrowId;
      }

      var originSpan = data.spans[arc.origin];
      var targetSpan = data.spans[arc.target];
      var pathId = 'annotator' + id + '_path_' + arc.origin + '_' + arc.type + '_' + arc.target;

      // TODO FIXME: can we account for this in the original lineIndex?
      //var leftToRight = originSpan.from + originSpan.to < targetSpan.from + targetSpan.to; // /2 unneeded
      var leftToRight = originSpan.lineIndex < targetSpan.lineIndex;
      var left, right;
      if (leftToRight) {
        left = originSpan;
        right = targetSpan;
      } else {
        left = targetSpan;
        right = originSpan;
      }
      var leftBox = rowBBox(left);
      var rightBox = rowBBox(right);
      var leftRow = left.chunk.row.index;
      var rightRow = right.chunk.row.index;

      var fromIndex = left.lineIndex;
      var toIndex = right.lineIndex;

      // find the next height
      var height = 0;
      var toIndex2 = toIndex * 2;
      for (var i = fromIndex * 2 + 1; i < toIndex2; i++) {
        if (spanHeights[i] > height) height = spanHeights[i];
      }
      height += arcSpacing;
      var leftSlantBound, rightSlantBound;
      for (var i = fromIndex * 2 + 1; i < toIndex2; i++) {
        if (spanHeights[i] < height) spanHeights[i] = height;
      }

      for (var rowIndex = leftRow; rowIndex <= rightRow; rowIndex++) {
        var row = rows[rowIndex];
        var arcGroup = svg.group(row.arcs,
            { 'data-from': arc.origin, 'data-to': arc.target});
        var from, to;
        
        if (rowIndex == leftRow) {
          from = leftBox.x + leftBox.width;
        } else {
          from = 0;
        }

        if (rowIndex == rightRow) {
          to = rightBox.x;
        } else {
          to = canvasWidth - 2 * margin.y;
        }

        var text = svg.text(arcGroup, (from + to) / 2, -height, arc.type, {
            'class': 'fill_' + arc.type,
        });
        var textBox = text.getBBox();
        var textStart = textBox.x - margin.x;
        var textEnd = textStart + textBox.width + 2 * margin.x;
        if (from > to) {
          var tmp = textStart; textStart = textEnd; textEnd = tmp;
        }

        var path;
        path = svg.createPath().moveTo(textStart, -height);
        if (rowIndex == leftRow) {
          path.line(from + arcSlant, -height).
            line(from, leftBox.y);
        } else {
          path.line(from, -height);
        }
        svg.path(arcGroup, path, {
            markerEnd: leftToRight ? undefined : ('url(#' + arrows[arc.type] + ')'),
            'class': 'stroke_' + arc.type,
        });
        path = svg.createPath().moveTo(textEnd, -height);
        if (rowIndex == rightRow) {
          path.line(to - arcSlant, -height).
            line(to, rightBox.y);
        } else {
          path.line(to, -height);
        }
        svg.path(arcGroup, path, {
            markerEnd: leftToRight ? 'url(#' + arrows[arc.type] + ')' : undefined,
            'class': 'stroke_' + arc.type,
        });
      } // arc rows
    }); // arcs

    var y = margin.y;
    $.each(rows, function(rowId, row) {
      var rowBox = row.group.getBBox();
      y += rowBox.height;
      translate(row, 0, y);
      y += margin.y;
    });
    y += margin.y;

    // resize the SVG
    $(svg._svg).attr('height', y).css('height', y);
    $(containerElement).attr('height', y).css('height', y);
  }

  containerElement.svg({
      onLoad: this.drawInitial,
      settings: {
      /*
          onmouseover: this.variable + ".mouseOver(evt)",
          onmouseout: this.variable + ".mouseOut(evt)",
          onmousedown: this.variable + ".mouseDown(evt)",
          onmousemove: this.variable + ".mouseMove(evt)",
          onmouseup: this.variable + ".mouseUp(evt)",
      */
      }
  });
};

$(function() {
  var address = window.location.href;
  if (!window.location.hash.substr(1)) return;
  var directory = window.location.hash.substr(1).split('/')[0];
  var doc;
  var lastDoc = null;
  var qmark = address.indexOf('#');
  var slashmark = address.lastIndexOf('/', qmark);
  var base = address.slice(0, slashmark + 1);
  var ajaxURL = base + "ajax.cgi?directory=" + directory;


  $.get(ajaxURL, function(data) {
    $('#document_select').html(data).val(doc);
  });

  var annotator = new Annotator('#svg', function() {
    var annotator = this;

    var lastHash = null;
    var directoryAndDoc;
    var drawing = false;
    var updateState = function() {
      if (drawing || lastHash == window.location.hash) return;
      lastHash = window.location.hash;
      var parts = lastHash.substr(1).split('/');
      directory = parts[0];
      doc = parts[1];
      $('#document_select').val(doc);

      $('#document_name').text(directoryAndDoc);
      if (!doc) return;
      $.get(ajaxURL + "&document=" + doc, function(jsonData) {
          drawing = true;
          annotator.renderData(jsonData);
          drawing = false;
      });
    }

    setInterval(updateState, 200); // TODO okay?

    var renderSelected = function(evt) {
      doc = $('#document_select').val();
      directoryAndDoc = directory + (doc ? '/' + doc : '');
      window.location.hash = '#' + directoryAndDoc;
      updateState();
      return false;
    };

    $('#document_form').
        submit(renderSelected).
        children().
        removeAttr('disabled');

    $('#document_select').
        change(renderSelected);

    directoryAndDoc = directory + (doc ? '/' + doc : '');
    updateState(doc);
  });

  $(window).resize(function(evt) {
    annotator.renderData();
  });
});