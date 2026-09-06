import { useEffect, useMemo, useState } from "react";
import { fromArrayBuffer } from "geotiff";
import "./App.css";

function App() {
  const [rows, setRows] = useState(5);
  const [cols, setCols] = useState(5);
  const [grid, setGrid] = useState([]);

  const [normalizedGrid, setNormalizedGrid] = useState([]);

  const [tiffName, setTiffName] = useState("");
  const [pixelSize, setPixelSize] = useState(null);
  const [tiffError, setTiffError] = useState("");

  const [selectedPixel, setSelectedPixel] = useState(null);
  const [hoveredPixel, setHoveredPixel] = useState(null);

  const [geoInfo, setGeoInfo] = useState(null);

  const [statistics, setStatistics] = useState(null);
  const [fullRasterStatistics, setFullRasterStatistics] = useState(null);

  const [classificationClasses, setClassificationClasses] = useState(5);
  const [classificationMethod, setClassificationMethod] = useState("equal");
  const [classifiedGrid, setClassifiedGrid] = useState([]);
  const [classBreaks, setClassBreaks] = useState([]);

  const [mapZoom, setMapZoom] = useState(1);

  // Phase 1
  const [histogram, setHistogram] = useState([]);

  // Phase 2
  const [toolMode, setToolMode] = useState("identify");
  const [measurementPoints, setMeasurementPoints] = useState([]);
  const [distanceResult, setDistanceResult] = useState(null);

  const [areaCells, setAreaCells] = useState([]);
  const [areaResult, setAreaResult] = useState(null);

  // Phase 3
  const [copyStatus, setCopyStatus] = useState("");
  const [exportStatus, setExportStatus] = useState("");

  // =========================================================
  // BASIC HELPERS
  // =========================================================

  const getEPSG = (geoKeys) => {
    if (!geoKeys) return null;

    return (
      geoKeys.ProjectedCSTypeGeoKey ||
      geoKeys.GeographicTypeGeoKey ||
      null
    );
  };

  const formatNumber = (value) => {
    if (
      value === null ||
      value === undefined ||
      !Number.isFinite(Number(value))
    ) {
      return "N/A";
    }

    const number = Number(value);

    if (Math.abs(number) >= 1000) {
      return number.toLocaleString(undefined, {
        maximumFractionDigits: 2,
      });
    }

    return number.toLocaleString(undefined, {
      maximumFractionDigits: 4,
    });
  };

  const formatCoordinate = (value) => {
    if (
      value === null ||
      value === undefined ||
      !Number.isFinite(Number(value))
    ) {
      return "N/A";
    }

    return Number(value).toFixed(6);
  };

  // =========================================================
  // PIXEL COORDINATE
  // =========================================================

  const getPixelCoordinate = (
    rowIndex,
    colIndex,
    info,
    sourceHeight,
    sourceWidth
  ) => {
    if (!info) return null;

    const {
      origin,
      resolution,
      boundingBox,
      transformation,
    } = info;

    const x = colIndex;
    const y = rowIndex;

    if (
      transformation &&
      transformation.length >= 16
    ) {
      const matrix = transformation;

      const X =
        matrix[0] * x +
        matrix[1] * y +
        matrix[3];

      const Y =
        matrix[4] * x +
        matrix[5] * y +
        matrix[7];

      return {
        x: X,
        y: Y,
      };
    }

    if (origin && resolution) {
      return {
        x:
          origin[0] +
          (colIndex + 0.5) *
            resolution[0],

        y:
          origin[1] +
          (rowIndex + 0.5) *
            resolution[1],
      };
    }

    if (boundingBox) {
      const minX = boundingBox[0];
      const minY = boundingBox[1];
      const maxX = boundingBox[2];
      const maxY = boundingBox[3];

      const cellWidth =
        (maxX - minX) /
        sourceWidth;

      const cellHeight =
        (maxY - minY) /
        sourceHeight;

      return {
        x:
          minX +
          (colIndex + 0.5) *
            cellWidth,

        y:
          maxY -
          (rowIndex + 0.5) *
            cellHeight,
      };
    }

    return null;
  };

  // =========================================================
  // NODATA
  // =========================================================

  const getNoDataValue = (
    fileDirectory
  ) => {
    if (!fileDirectory) return null;

    const candidates = [
      fileDirectory.GDAL_NODATA,
      fileDirectory.GDALNoData,
      fileDirectory.NoData,
      fileDirectory.NODATA,
    ];

    for (const value of candidates) {
      if (
        value !== undefined &&
        value !== null &&
        value !== ""
      ) {
        const numericValue =
          Number(value);

        if (
          Number.isFinite(
            numericValue
          )
        ) {
          return numericValue;
        }
      }
    }

    return null;
  };

  const isValidValue = (
    value,
    noDataValue
  ) => {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return false;
    }

    const numericValue =
      Number(value);

    if (
      !Number.isFinite(
        numericValue
      )
    ) {
      return false;
    }

    if (
      noDataValue !== null &&
      noDataValue !== undefined &&
      numericValue ===
        Number(noDataValue)
    ) {
      return false;
    }

    return true;
  };

  // =========================================================
  // STATISTICS
  // =========================================================

  const calculateStatistics = (
    data,
    noDataValue = null
  ) => {
    const values = data
      .filter((value) =>
        isValidValue(
          value,
          noDataValue
        )
      )
      .map(Number);

    const invalidCount =
      data.length -
      values.length;

    if (!values.length) {
      return null;
    }

    const count =
      values.length;

    const min =
      Math.min(...values);

    const max =
      Math.max(...values);

    const sum =
      values.reduce(
        (a, b) => a + b,
        0
      );

    const mean =
      sum / count;

    const variance =
      values.reduce(
        (total, value) =>
          total +
          Math.pow(
            value - mean,
            2
          ),
        0
      ) / count;

    const standardDeviation =
      Math.sqrt(variance);

    const sorted =
      [...values].sort(
        (a, b) => a - b
      );

    let median;

    if (
      sorted.length % 2 ===
      0
    ) {
      const middle =
        sorted.length / 2;

      median =
        (sorted[middle - 1] +
          sorted[middle]) /
        2;
    } else {
      median =
        sorted[
          Math.floor(
            sorted.length / 2
          )
        ];
    }

    return {
      count,
      noDataCount:
        invalidCount,
      min,
      max,
      range: max - min,
      mean,
      median,
      sum,
      variance,
      standardDeviation,
    };
  };

  const currentStatistics =
    useMemo(() => {
      if (!grid.length) {
        return null;
      }

      return calculateStatistics(
        grid.flat(),
        geoInfo?.noDataValue ??
          null
      );
    }, [grid, geoInfo]);

  const displayStatistics =
    currentStatistics ||
    statistics;

  // =========================================================
  // HISTOGRAM
  // =========================================================

  const createHistogram = (
    data,
    noDataValue = null,
    binCount = 8
  ) => {
    const values = data
      .filter((value) =>
        isValidValue(
          value,
          noDataValue
        )
      )
      .map(Number);

    if (!values.length) {
      return [];
    }

    const min =
      Math.min(...values);

    const max =
      Math.max(...values);

    if (min === max) {
      return [
        {
          start: min,
          end: max,
          count: values.length,
        },
      ];
    }

    const step =
      (max - min) /
      binCount;

    const bins = Array.from(
      {
        length: binCount,
      },
      (_, index) => ({
        start:
          min +
          index * step,

        end:
          index ===
          binCount - 1
            ? max
            : min +
              (index + 1) *
                step,

        count: 0,
      })
    );

    values.forEach(
      (value) => {
        let index =
          Math.floor(
            (value - min) /
              step
          );

        if (
          index >= binCount
        ) {
          index =
            binCount - 1;
        }

        bins[index].count++;
      }
    );

    return bins;
  };

  useEffect(() => {
    if (!grid.length) {
      setHistogram([]);
      return;
    }

    const newHistogram =
      createHistogram(
        grid.flat(),
        geoInfo?.noDataValue ??
          null,
        8
      );

    setHistogram(
      newHistogram
    );
  }, [grid, geoInfo]);

  // =========================================================
  // CREATE GRID
  // =========================================================

  const createGrid = () => {
    const safeRows =
      Math.max(
        1,
        Math.min(
          30,
          Number(rows) || 5
        )
      );

    const safeCols =
      Math.max(
        1,
        Math.min(
          30,
          Number(cols) || 5
        )
      );

    setRows(safeRows);
    setCols(safeCols);

    const newGrid =
      Array.from(
        {
          length: safeRows,
        },
        () =>
          Array(
            safeCols
          ).fill(0)
      );

    setGrid(newGrid);

    setNormalizedGrid([]);
    setClassifiedGrid([]);
    setClassBreaks([]);

    setSelectedPixel(null);
    setHoveredPixel(null);

    setTiffName("");
    setGeoInfo(null);
    setPixelSize(null);

    setStatistics(null);
    setFullRasterStatistics(
      null
    );

    setMeasurementPoints([]);
    setDistanceResult(null);

    setAreaCells([]);
    setAreaResult(null);

    setToolMode("identify");
    setMapZoom(1);

    setTiffError("");
    setCopyStatus("");
    setExportStatus("");
  };

  // =========================================================
  // UPDATE CELL
  // =========================================================

  const updateCell = (
    rowIndex,
    colIndex,
    value
  ) => {
    const numericValue =
      value === ""
        ? null
        : Number(value);

    setGrid((previous) =>
      previous.map(
        (row, r) =>
          row.map(
            (cell, c) =>
              r === rowIndex &&
              c === colIndex
                ? numericValue
                : cell
          )
      )
    );

    setNormalizedGrid([]);
    setClassifiedGrid([]);
    setClassBreaks([]);
  };

  // =========================================================
  // MAP COORDINATE
  // =========================================================

  const getMapCoordinate = (
    rowIndex,
    colIndex
  ) => {
    if (!geoInfo) {
      return null;
    }

    return getPixelCoordinate(
      rowIndex,
      colIndex,
      geoInfo,
      geoInfo.height,
      geoInfo.width
    );
  };

  // =========================================================
  // SELECT PIXEL
  // =========================================================

  const selectPixel = (
    rowIndex,
    colIndex
  ) => {
    const value =
      grid[rowIndex]?.[
        colIndex
      ];

    if (value === undefined) {
      return;
    }

    const coordinate =
      getMapCoordinate(
        rowIndex,
        colIndex
      );

    setSelectedPixel({
      row: rowIndex,
      col: colIndex,
      value,
      coordinate,
    });
  };

  // =========================================================
  // TIFF UPLOAD
  // =========================================================

  const handleTiffUpload =
    async (event) => {
      const file =
        event.target.files?.[0];

      if (!file) return;

      try {
        setTiffError("");
        setTiffName(file.name);

        setSelectedPixel(null);
        setNormalizedGrid([]);
        setClassifiedGrid([]);
        setClassBreaks([]);

        setMeasurementPoints([]);
        setDistanceResult(null);

        setAreaCells([]);
        setAreaResult(null);

        const arrayBuffer =
          await file.arrayBuffer();

        const tiff =
          await fromArrayBuffer(
            arrayBuffer
          );

        const image =
          await tiff.getImage();

        const width =
          image.getWidth();

        const height =
          image.getHeight();

        const fileDirectory =
          image.getFileDirectory();

        const geoKeys =
          image.getGeoKeys();

        const boundingBox =
          image.getBoundingBox?.() ||
          null;

        let origin = null;
        let resolution = null;
        let transformation =
          null;

        try {
          origin =
            image.getOrigin?.() ||
            null;
        } catch {
          origin = null;
        }

        try {
          resolution =
            image.getResolution?.() ||
            null;
        } catch {
          resolution = null;
        }

        try {
          transformation =
            fileDirectory
              ?.ModelTransformationTag ||
            null;
        } catch {
          transformation = null;
        }

        let detectedMethod =
          "Not available";

        if (transformation) {
          detectedMethod =
            "Model Transformation";
        } else if (
          origin &&
          resolution
        ) {
          detectedMethod =
            "Origin + Pixel Resolution";
        } else if (
          boundingBox
        ) {
          detectedMethod =
            "Bounding Box";
        }

        const epsg =
          getEPSG(geoKeys);

        const noDataValue =
          getNoDataValue(
            fileDirectory
          );

        const displayRows =
          Math.min(
            30,
            height
          );

        const displayCols =
          Math.min(
            30,
            width
          );

        const sampledRasters =
          await image.readRasters({
            width:
              displayCols,

            height:
              displayRows,

            interleave:
              true,
          });

        const sampledGrid =
          [];

        for (
          let r = 0;
          r < displayRows;
          r++
        ) {
          const row = [];

          for (
            let c = 0;
            c < displayCols;
            c++
          ) {
            const index =
              r *
                displayCols +
              c;

            const value =
              sampledRasters[
                index
              ];

            if (
              isValidValue(
                value,
                noDataValue
              )
            ) {
              row.push(
                Number(value)
              );
            } else {
              row.push(null);
            }
          }

          sampledGrid.push(
            row
          );
        }

        const geoInformation =
          {
            epsg,
            width,
            height,
            origin,
            resolution,
            boundingBox,
            transformation,
            detectedMethod,
            noDataValue,
          };

        setGeoInfo(
          geoInformation
        );

        if (resolution) {
          setPixelSize({
            x: Math.abs(
              resolution[0]
            ),
            y: Math.abs(
              resolution[1]
            ),
          });
        } else if (
          boundingBox
        ) {
          setPixelSize({
            x:
              Math.abs(
                boundingBox[2] -
                  boundingBox[0]
              ) / width,

            y:
              Math.abs(
                boundingBox[3] -
                  boundingBox[1]
              ) / height,
          });
        } else {
          setPixelSize(null);
        }

        setGrid(
          sampledGrid
        );

        const previewStats =
          calculateStatistics(
            Array.from(
              sampledRasters
            ),
            noDataValue
          );

        setStatistics(
          previewStats
        );

        setFullRasterStatistics(
          null
        );

        setRows(
          displayRows
        );

        setCols(
          displayCols
        );

        setMapZoom(1);
      } catch (error) {
        console.error(error);

        setTiffError(
          "Unable to read raster pixels from this TIFF/GeoTIFF file."
        );
      }
    };

  // =========================================================
  // NORMALIZATION
  // =========================================================

  const normalizeGrid = () => {
    if (!grid.length) {
      return;
    }

    const values = grid
      .flat()
      .filter((value) =>
        isValidValue(
          value,
          geoInfo?.noDataValue ??
            null
        )
      )
      .map(Number);

    if (!values.length) {
      return;
    }

    const min =
      Math.min(...values);

    const max =
      Math.max(...values);

    const normalized =
      grid.map((row) =>
        row.map((value) => {
          if (
            !isValidValue(
              value,
              geoInfo?.noDataValue ??
                null
            )
          ) {
            return null;
          }

          if (max === min) {
            return 0.5;
          }

          return (
            (Number(value) - min) /
            (max - min)
          );
        })
      );

    setNormalizedGrid(
      normalized
    );
  };

  // =========================================================
  // HEATMAP COLOR
  // =========================================================

  const getHeatmapColor =
    (value) => {
      if (
        value === null ||
        value === undefined ||
        !Number.isFinite(value)
      ) {
        return "transparent";
      }

      const hue =
        240 - value * 240;

      return `hsl(${hue}, 85%, 55%)`;
    };

  // =========================================================
  // CLASSIFICATION
  // =========================================================

  const classifyRaster =
    () => {
      const values = grid
        .flat()
        .filter((value) =>
          isValidValue(
            value,
            geoInfo?.noDataValue ??
              null
          )
        )
        .map(Number);

      if (!values.length) {
        return;
      }

      const classes =
        Math.max(
          2,
          Math.min(
            10,
            Number(
              classificationClasses
            )
          )
        );

      const sorted =
        [...values].sort(
          (a, b) => a - b
        );

      let breaks = [];

      if (
        classificationMethod ===
        "equal"
      ) {
        const min =
          Math.min(...values);

        const max =
          Math.max(...values);

        const step =
          (max - min) /
          classes;

        breaks = Array.from(
          {
            length: classes,
          },
          (_, index) => {
            if (
              index ===
              classes - 1
            ) {
              return max;
            }

            return (
              min +
              step *
                (index + 1)
            );
          }
        );
      } else {
        breaks = Array.from(
          {
            length: classes,
          },
          (_, index) => {
            if (
              index ===
              classes - 1
            ) {
              return sorted[
                sorted.length - 1
              ];
            }

            const position =
              Math.ceil(
                ((index + 1) /
                  classes) *
                  sorted.length
              ) - 1;

            return sorted[
              Math.max(
                0,
                Math.min(
                  sorted.length - 1,
                  position
                )
              )
            ];
          }
        );
      }

      const classified =
        grid.map((row) =>
          row.map((value) => {
            if (
              !isValidValue(
                value,
                geoInfo?.noDataValue ??
                  null
              )
            ) {
              return null;
            }

            let classNumber = 1;

            for (
              let i = 0;
              i < breaks.length;
              i++
            ) {
              if (
                value <=
                breaks[i]
              ) {
                classNumber =
                  i + 1;

                break;
              }
            }

            return classNumber;
          })
        );

      setClassBreaks(
        breaks
      );

      setClassifiedGrid(
        classified
      );
    };

  const getClassColor =
    (classNumber) => {
      if (!classNumber) {
        return "transparent";
      }

      const total =
        Math.max(
          2,
          Number(
            classificationClasses
          )
        );

      const hue =
        20 +
        ((classNumber - 1) /
          Math.max(
            1,
            total - 1
          )) *
          210;

      return `hsl(${hue}, 75%, 55%)`;
    };

  // =========================================================
  // AXIS LABELS
  // =========================================================

  const getXAxisLabel = (
    colIndex
  ) => {
    if (!geoInfo) {
      return colIndex + 1;
    }

    const coordinate =
      getMapCoordinate(
        0,
        colIndex
      );

    return coordinate
      ? formatCoordinate(
          coordinate.x
        )
      : colIndex + 1;
  };

  const getYAxisLabel = (
    rowIndex
  ) => {
    if (!geoInfo) {
      return rowIndex + 1;
    }

    const coordinate =
      getMapCoordinate(
        rowIndex,
        0
      );

    return coordinate
      ? formatCoordinate(
          coordinate.y
        )
      : rowIndex + 1;
  };

  // =========================================================
  // ZOOM
  // =========================================================

  const zoomIn = () => {
    setMapZoom((value) =>
      Math.min(
        3,
        value + 0.25
      )
    );
  };

  const zoomOut = () => {
    setMapZoom((value) =>
      Math.max(
        0.5,
        value - 0.25
      )
    );
  };

  const resetZoom = () => {
    setMapZoom(1);
  };

  const fitMap = () => {
    setMapZoom(1);
  };

  // =========================================================
  // DISTANCE
  // =========================================================

  const isGeographicCRS =
    () => {
      const epsg =
        Number(
          geoInfo?.epsg
        );

      return (
        epsg === 4326 ||
        epsg === 4269 ||
        epsg === 4258 ||
        epsg === 4267
      );
    };

  const haversineDistance = (
    coordinate1,
    coordinate2
  ) => {
    const R =
      6371008.8;

    const lat1 =
      (coordinate1.y *
        Math.PI) /
      180;

    const lat2 =
      (coordinate2.y *
        Math.PI) /
      180;

    const deltaLat =
      ((coordinate2.y -
        coordinate1.y) *
        Math.PI) /
      180;

    const deltaLon =
      ((coordinate2.x -
        coordinate1.x) *
        Math.PI) /
      180;

    const a =
      Math.sin(
        deltaLat / 2
      ) **
        2 +
      Math.cos(lat1) *
        Math.cos(lat2) *
        Math.sin(
          deltaLon / 2
        ) **
        2;

    const c =
      2 *
      Math.atan2(
        Math.sqrt(a),
        Math.sqrt(1 - a)
      );

    return R * c;
  };

  const calculateDistance = (
    coordinate1,
    coordinate2
  ) => {
    if (
      isGeographicCRS()
    ) {
      return {
        value:
          haversineDistance(
            coordinate1,
            coordinate2
          ),
        unit: "meters",
      };
    }

    const dx =
      coordinate2.x -
      coordinate1.x;

    const dy =
      coordinate2.y -
      coordinate1.y;

    return {
      value: Math.sqrt(
        dx * dx + dy * dy
      ),
      unit: "map units",
    };
  };

  // =========================================================
  // AREA
  // =========================================================

  const getCellArea = (
    rowIndex,
    colIndex
  ) => {
    if (!geoInfo) {
      return null;
    }

    const coordinate =
      getMapCoordinate(
        rowIndex,
        colIndex
      );

    if (!coordinate) {
      return null;
    }

    if (
      isGeographicCRS()
    ) {
      if (!pixelSize) {
        return null;
      }

      const latitudeRadians =
        (coordinate.y *
          Math.PI) /
        180;

      const metersPerDegreeLat =
        110540;

      const metersPerDegreeLon =
        111320 *
        Math.cos(
          latitudeRadians
        );

      const widthMeters =
        pixelSize.x *
        metersPerDegreeLon;

      const heightMeters =
        pixelSize.y *
        metersPerDegreeLat;

      return Math.abs(
        widthMeters *
          heightMeters
      );
    }

    if (!pixelSize) {
      return null;
    }

    return Math.abs(
      pixelSize.x *
        pixelSize.y
    );
  };

  const calculateSelectedArea =
    (selectedCells) => {
      if (
        !selectedCells.length
      ) {
        setAreaResult(null);
        return;
      }

      let totalArea = 0;

      selectedCells.forEach(
        (key) => {
          const [r, c] =
            key
              .split("-")
              .map(Number);

          const cellArea =
            getCellArea(r, c);

          if (cellArea) {
            totalArea +=
              cellArea;
          }
        }
      );

      setAreaResult({
        cells:
          selectedCells.length,
        area: totalArea,
        unit: "m²",
      });
    };

  // =========================================================
  // MAP CLICK
  // =========================================================

  const handleMapCellClick =
    (
      rowIndex,
      colIndex
    ) => {
      const coordinate =
        getMapCoordinate(
          rowIndex,
          colIndex
        );

      if (!coordinate) {
        return;
      }

      if (
        toolMode ===
        "identify"
      ) {
        selectPixel(
          rowIndex,
          colIndex
        );

        return;
      }

      if (
        toolMode ===
        "distance"
      ) {
        if (
          measurementPoints.length >=
          2
        ) {
          const newPoint = {
            row: rowIndex,
            col: colIndex,
            coordinate,
          };

          setMeasurementPoints([
            newPoint,
          ]);

          setDistanceResult(
            null
          );

          return;
        }

        const newPoint = {
          row: rowIndex,
          col: colIndex,
          coordinate,
        };

        const updatedPoints =
          [
            ...measurementPoints,
            newPoint,
          ];

        setMeasurementPoints(
          updatedPoints
        );

        if (
          updatedPoints.length ===
          2
        ) {
          const result =
            calculateDistance(
              updatedPoints[0]
                .coordinate,
              updatedPoints[1]
                .coordinate
            );

          setDistanceResult(
            result
          );
        }

        return;
      }

      if (
        toolMode ===
        "area"
      ) {
        const key = `${rowIndex}-${colIndex}`;

        setAreaCells(
          (previous) => {
            const exists =
              previous.includes(
                key
              );

            const updated =
              exists
                ? previous.filter(
                    (item) =>
                      item !== key
                  )
                : [
                    ...previous,
                    key,
                  ];

            calculateSelectedArea(
              updated
            );

            return updated;
          }
        );
      }
    };

  // =========================================================
  // DOWNLOAD
  // =========================================================

  const downloadBlob = (
    content,
    filename,
    type
  ) => {
    const blob =
      new Blob(
        [content],
        { type }
      );

    const url =
      URL.createObjectURL(
        blob
      );

    const link =
      document.createElement(
        "a"
      );

    link.href = url;
    link.download =
      filename;

    document.body.appendChild(
      link
    );

    link.click();

    link.remove();

    URL.revokeObjectURL(
      url
    );
  };

  // =========================================================
  // CSV EXPORT
  // =========================================================

  const exportGridCSV = () => {
    if (!grid.length) {
      return;
    }

    const lines = [];

    lines.push(
      [
        "Row",
        "Column",
        "Value",
      ].join(",")
    );

    grid.forEach(
      (row, rowIndex) => {
        row.forEach(
          (value, colIndex) => {
            lines.push(
              [
                rowIndex + 1,
                colIndex + 1,
                value === null
                  ? ""
                  : value,
              ].join(",")
            );
          }
        );
      }
    );

    const csv =
      "\uFEFF" +
      lines.join("\n");

    downloadBlob(
      csv,
      "39GeoGrid_raster.csv",
      "text/csv;charset=utf-8"
    );

    setExportStatus(
      "CSV exported successfully."
    );
  };

  // =========================================================
  // HEATMAP PNG
  // =========================================================

  const exportHeatmapPNG =
    () => {
      if (!grid.length) {
        return;
      }

      const values = grid
        .flat()
        .filter((value) =>
          isValidValue(
            value,
            geoInfo?.noDataValue ??
              null
          )
        )
        .map(Number);

      if (!values.length) {
        return;
      }

      const min =
        Math.min(...values);

      const max =
        Math.max(...values);

      const cellSize = 25;

      const canvas =
        document.createElement(
          "canvas"
        );

      canvas.width =
        cols * cellSize;

      canvas.height =
        rows * cellSize;

      const context =
        canvas.getContext(
          "2d"
        );

      grid.forEach(
        (row, r) => {
          row.forEach(
            (value, c) => {
              if (
                !isValidValue(
                  value,
                  geoInfo?.noDataValue ??
                    null
                )
              ) {
                return;
              }

              const normalized =
                max === min
                  ? 0.5
                  : (value - min) /
                    (max - min);

              context.fillStyle =
                getHeatmapColor(
                  normalized
                );

              context.fillRect(
                c * cellSize,
                r * cellSize,
                cellSize,
                cellSize
              );
            }
          );
        }
      );

      canvas.toBlob(
        (blob) => {
          if (!blob) return;

          const url =
            URL.createObjectURL(
              blob
            );

          const link =
            document.createElement(
              "a"
            );

          link.href = url;

          link.download =
            "39GeoGrid_heatmap.png";

          document.body.appendChild(
            link
          );

          link.click();

          link.remove();

          URL.revokeObjectURL(
            url
          );

          setExportStatus(
            "Heatmap PNG exported successfully."
          );
        },
        "image/png"
      );
    };

  // =========================================================
  // COPY STATISTICS
  // =========================================================

  const copyStatistics =
    async () => {
      if (
        !displayStatistics
      ) {
        return;
      }

      const text = `
39GeoGrid Raster Statistics
---------------------------
File: ${
        tiffName ||
        "Manual Raster"
      }
Rows: ${rows}
Columns: ${cols}
EPSG: ${
        geoInfo?.epsg ||
        "N/A"
      }

Valid Pixels: ${
        displayStatistics.count
      }
NoData Pixels: ${
        displayStatistics.noDataCount
      }

Minimum: ${
        displayStatistics.min
      }
Maximum: ${
        displayStatistics.max
      }
Range: ${
        displayStatistics.range
      }
Mean: ${
        displayStatistics.mean
      }
Median: ${
        displayStatistics.median
      }
Sum: ${
        displayStatistics.sum
      }
Variance: ${
        displayStatistics.variance
      }
Standard Deviation: ${
        displayStatistics.standardDeviation
      }
`.trim();

      try {
        await navigator.clipboard.writeText(
          text
        );

        setCopyStatus(
          "Statistics copied!"
        );

        setTimeout(
          () =>
            setCopyStatus(""),
          2500
        );
      } catch {
        setCopyStatus(
          "Copy failed. Please copy manually."
        );
      }
    };

  // =========================================================
  // REPORT
  // =========================================================

  const downloadReport =
    () => {
      const stats =
        displayStatistics;

      const report = `
39GeoGrid
Raster GIS Analysis Report
==========================

PROJECT INFORMATION
-------------------

Raster File:
${
        tiffName ||
        "Manual Raster"
      }

Preview Size:
${rows} rows × ${cols} columns

Original Raster Size:
${
        geoInfo
          ? `${geoInfo.width} × ${geoInfo.height}`
          : "N/A"
      }

EPSG:
${
        geoInfo?.epsg ||
        "N/A"
      }

Coordinate Detection:
${
        geoInfo?.detectedMethod ||
        "N/A"
      }

Pixel Width:
${
        pixelSize?.x ??
        "N/A"
      }

Pixel Height:
${
        pixelSize?.y ??
        "N/A"
      }

NoData Value:
${
        geoInfo?.noDataValue ??
        "Not detected"
      }


RASTER STATISTICS
-----------------

Valid Pixels:
${stats?.count ?? "N/A"}

NoData Pixels:
${stats?.noDataCount ?? "N/A"}

Minimum:
${stats?.min ?? "N/A"}

Maximum:
${stats?.max ?? "N/A"}

Range:
${stats?.range ?? "N/A"}

Mean:
${stats?.mean ?? "N/A"}

Median:
${stats?.median ?? "N/A"}

Sum:
${stats?.sum ?? "N/A"}

Variance:
${stats?.variance ?? "N/A"}

Standard Deviation:
${
        stats?.standardDeviation ??
        "N/A"
      }


CLASSIFICATION
--------------

Method:
${
        classificationMethod ===
        "equal"
          ? "Equal Interval"
          : "Quantile"
      }

Number of Classes:
${classificationClasses}

Class Breaks:
${
        classBreaks.length
          ? classBreaks.join(
              ", "
            )
          : "Not classified"
      }


DISTANCE ANALYSIS
-----------------

Distance:
${
        distanceResult
          ? `${formatNumber(
              distanceResult.value
            )} ${
              distanceResult.unit
            }`
          : "Not calculated"
      }


AREA ANALYSIS
-------------

Selected Cells:
${areaResult?.cells ?? 0}

Total Area:
${
        areaResult
          ? `${formatNumber(
              areaResult.area
            )} ${
              areaResult.unit
            }`
          : "Not calculated"
      }


Generated by 39GeoGrid
Raster GIS Analysis Tool
`;

      downloadBlob(
        report.trim(),
        "39GeoGrid_analysis_report.txt",
        "text/plain;charset=utf-8"
      );

      setExportStatus(
        "Analysis report downloaded."
      );
    };

  // =========================================================
  // RESET ANALYSIS
  // =========================================================

  const resetAnalysis =
    () => {
      setNormalizedGrid([]);
      setClassifiedGrid([]);
      setClassBreaks([]);

      setMeasurementPoints([]);
      setDistanceResult(null);

      setAreaCells([]);
      setAreaResult(null);

      setToolMode("identify");

      setSelectedPixel(null);
      setHoveredPixel(null);

      setMapZoom(1);

      setCopyStatus("");
      setExportStatus("");
    };

  // =========================================================
  // CLEAR PROJECT
  // =========================================================

  const clearProject = () => {
    setGrid([]);
    setNormalizedGrid([]);

    setTiffName("");
    setGeoInfo(null);
    setPixelSize(null);

    setStatistics(null);
    setFullRasterStatistics(
      null
    );

    setSelectedPixel(null);
    setHoveredPixel(null);

    setClassifiedGrid([]);
    setClassBreaks([]);

    setMeasurementPoints([]);
    setDistanceResult(null);

    setAreaCells([]);
    setAreaResult(null);

    setHistogram([]);

    setToolMode("identify");
    setMapZoom(1);

    setTiffError("");

    setRows(5);
    setCols(5);

    setCopyStatus("");
    setExportStatus("");
  };

  // =========================================================
  // RENDER
  // =========================================================

  return (
    <div className="app">

      {/* HEADER */}
      <header className="header">

        <div className="logo">

          <div className="logo-mark">

            <div className="logo-letter">
              39
            </div>

            <div className="logo-grid">
              <span></span>
              <span></span>
              <span></span>
              <span></span>
            </div>

          </div>

          <div>
            <h1>
              39GeoGrid
            </h1>

            <p>
              Raster GIS Analysis Tool
            </p>
          </div>

        </div>

        <div className="header-actions">

          <label className="upload-button">

            Upload GeoTIFF

            <input
              type="file"
              accept=".tif,.tiff,.geotiff"
              onChange={
                handleTiffUpload
              }
            />

          </label>

        </div>

      </header>

      {/* ERROR */}
      {tiffError && (
        <div className="error-box">
          ⚠ {tiffError}
        </div>
      )}

      {/* FILE STATUS */}
      {tiffName && (
        <div className="file-status">

          <span>📁</span>

          <strong>
            {tiffName}
          </strong>

          <span>
            Raster loaded successfully
          </span>

        </div>
      )}

      {/* METADATA */}
      {geoInfo && (
        <section className="card">

          <div className="section-title">

            <div>
              <h2>
                GeoTIFF Metadata
              </h2>

              <p>
                Spatial reference and raster information
              </p>
            </div>

          </div>

          <div className="metadata-grid">

            <div className="metadata-item">
              <span>EPSG</span>

              <strong>
                {geoInfo.epsg ||
                  "Not available"}
              </strong>
            </div>

            <div className="metadata-item">
              <span>Raster Width</span>

              <strong>
                {geoInfo.width} px
              </strong>
            </div>

            <div className="metadata-item">
              <span>Raster Height</span>

              <strong>
                {geoInfo.height} px
              </strong>
            </div>

            <div className="metadata-item">
              <span>Pixel Width</span>

              <strong>
                {pixelSize
                  ? formatNumber(
                      pixelSize.x
                    )
                  : "N/A"}
              </strong>
            </div>

            <div className="metadata-item">
              <span>Pixel Height</span>

              <strong>
                {pixelSize
                  ? formatNumber(
                      pixelSize.y
                    )
                  : "N/A"}
              </strong>
            </div>

            <div className="metadata-item">
              <span>Detection Method</span>

              <strong>
                {geoInfo.detectedMethod}
              </strong>
            </div>

          </div>

          <div className="metadata-extra">

            <div>
              <span>
                Origin
              </span>

              <strong>
                {geoInfo.origin
                  ? `${formatCoordinate(
                      geoInfo.origin[0]
                    )}, ${formatCoordinate(
                      geoInfo.origin[1]
                    )}`
                  : "N/A"}
              </strong>
            </div>

            <div>
              <span>
                Bounding Box
              </span>

              <strong>
                {geoInfo.boundingBox
                  ? geoInfo.boundingBox
                      .map(
                        formatCoordinate
                      )
                      .join(", ")
                  : "N/A"}
              </strong>
            </div>

          </div>

        </section>
      )}

      {/* NODATA */}
      {geoInfo && (
        <section className="info-card">

          <div className="info-icon">
            ◌
          </div>

          <div>

            <strong>
              NoData Information
            </strong>

            <p>
              {geoInfo.noDataValue !==
              null
                ? `Detected NoData value: ${geoInfo.noDataValue}`
                : "No explicit NoData value was detected."}
            </p>

          </div>

        </section>
      )}

      {/* CREATE GRID */}
      <section className="card">

        <div className="section-title">

          <div>
            <h2>
              Create Raster Grid
            </h2>

            <p>
              Create a manual raster grid for analysis
            </p>
          </div>

        </div>

        <div className="grid-controls">

          <div className="input-group">

            <label>
              Rows
            </label>

            <input
              type="number"
              min="1"
              max="30"
              value={rows}
              onChange={(e) =>
                setRows(
                  e.target.value
                )
              }
            />

          </div>

          <div className="input-group">

            <label>
              Columns
            </label>

            <input
              type="number"
              min="1"
              max="30"
              value={cols}
              onChange={(e) =>
                setCols(
                  e.target.value
                )
              }
            />

          </div>

          <button
            className="primary-button"
            onClick={
              createGrid
            }
          >
            Create Grid
          </button>

        </div>

      </section>

      {/* PROFESSIONAL TOOLS */}
      {grid.length > 0 && (
        <section className="card">

          <div className="section-title">

            <div>
              <h2>
                Professional Tools
              </h2>

              <p>
                Export, report and project management
              </p>
            </div>

          </div>

          <div className="tool-buttons">

            <button
              className="secondary-button"
              onClick={
                exportGridCSV
              }
            >
              ⬇ Export CSV
            </button>

            <button
              className="secondary-button"
              onClick={
                exportHeatmapPNG
              }
            >
              🖼 Export Heatmap
            </button>

            <button
              className="secondary-button"
              onClick={
                downloadReport
              }
            >
              📄 Download Report
            </button>

            <button
              className="secondary-button"
              onClick={
                copyStatistics
              }
            >
              📋 Copy Statistics
            </button>

            <button
              className="warning-button"
              onClick={
                resetAnalysis
              }
            >
              ↻ Reset Analysis
            </button>

            <button
              className="danger-button"
              onClick={
                clearProject
              }
            >
              ✕ Clear Project
            </button>

          </div>

          {copyStatus && (
            <div className="success-message">
              {copyStatus}
            </div>
          )}

          {exportStatus && (
            <div className="success-message">
              {exportStatus}
            </div>
          )}

        </section>
      )}

      {/* PIXEL VALUES */}
      {grid.length > 0 && (
        <section className="card">

          <div className="section-title">

            <div>
              <h2>
                Raster Pixel Values
              </h2>

              <p>
                Each raster cell is square
              </p>
            </div>

            <div className="badge">
              {rows} × {cols}
            </div>

          </div>

          <div
            className="pixel-grid"
            style={{
              gridTemplateColumns:
                `repeat(${cols}, 55px)`,
            }}
          >

            {grid.map(
              (
                row,
                rowIndex
              ) =>
                row.map(
                  (
                    value,
                    colIndex
                  ) => (
                    <input
                      key={`${rowIndex}-${colIndex}`}
                      className={`pixel ${
                        selectedPixel?.row ===
                          rowIndex &&
                        selectedPixel?.col ===
                          colIndex
                          ? "selected-pixel"
                          : ""
                      }`}
                      value={
                        value === null
                          ? ""
                          : value
                      }
                      onChange={(e) =>
                        updateCell(
                          rowIndex,
                          colIndex,
                          e.target.value
                        )
                      }
                      onClick={() =>
                        selectPixel(
                          rowIndex,
                          colIndex
                        )
                      }
                    />
                  )
                )
            )}

          </div>

        </section>
      )}

      {/* SELECTED PIXEL */}
      {selectedPixel && (
        <section className="selected-card">

          <div className="selected-header">

            <span className="selected-icon">
              ◉
            </span>

            <div>
              <h2>
                Selected Pixel
              </h2>

              <p>
                Raster cell information
              </p>
            </div>

          </div>

          <div className="selected-grid">

            <div>
              <span>
                Row
              </span>

              <strong>
                {selectedPixel.row +
                  1}
              </strong>
            </div>

            <div>
              <span>
                Column
              </span>

              <strong>
                {selectedPixel.col +
                  1}
              </strong>
            </div>

            <div>
              <span>
                Value
              </span>

              <strong>
                {selectedPixel.value ??
                  "NoData"}
              </strong>
            </div>

            <div>
              <span>
                X Coordinate
              </span>

              <strong>
                {selectedPixel.coordinate
                  ? formatCoordinate(
                      selectedPixel
                        .coordinate.x
                    )
                  : "N/A"}
              </strong>
            </div>

            <div>
              <span>
                Y Coordinate
              </span>

              <strong>
                {selectedPixel.coordinate
                  ? formatCoordinate(
                      selectedPixel
                        .coordinate.y
                    )
                  : "N/A"}
              </strong>
            </div>

          </div>

        </section>
      )}

      {/* MAP */}
      {grid.length > 0 &&
        geoInfo && (
          <section className="card">

            <div className="section-title">

              <div>
                <h2>
                  Coordinate Map View
                </h2>

                <p>
                  Identify pixels, measure distance and calculate area
                </p>
              </div>

              <div className="badge">
                EPSG:
                {geoInfo.epsg ||
                  "N/A"}
              </div>

            </div>

            {/* MAP TOOLBAR */}
            <div className="map-tools">

              <button
                className={
                  toolMode ===
                  "identify"
                    ? "mode-button active"
                    : "mode-button"
                }
                onClick={() => {
                  setToolMode(
                    "identify"
                  );

                  setMeasurementPoints(
                    []
                  );

                  setDistanceResult(
                    null
                  );
                }}
              >
                🔎 Identify
              </button>

              <button
                className={
                  toolMode ===
                  "distance"
                    ? "mode-button active"
                    : "mode-button"
                }
                onClick={() => {
                  setToolMode(
                    "distance"
                  );

                  setMeasurementPoints(
                    []
                  );

                  setDistanceResult(
                    null
                  );
                }}
              >
                📏 Distance
              </button>

              <button
                className={
                  toolMode ===
                  "area"
                    ? "mode-button active"
                    : "mode-button"
                }
                onClick={() => {
                  setToolMode(
                    "area"
                  );

                  setAreaCells([]);
                  setAreaResult(
                    null
                  );
                }}
              >
                ⬚ Area
              </button>

              <div className="map-divider"></div>

              <button
                className="zoom-button"
                onClick={
                  zoomIn
                }
              >
                +
              </button>

              <button
                className="zoom-button"
                onClick={
                  zoomOut
                }
              >
                −
              </button>

              <button
                className="zoom-button wide"
                onClick={
                  resetZoom
                }
              >
                Reset
              </button>

              <button
                className="zoom-button wide"
                onClick={
                  fitMap
                }
              >
                Fit
              </button>

              <span className="zoom-label">
                Zoom{" "}
                {Math.round(
                  mapZoom * 100
                )}
                %
              </span>

            </div>

            {/* DISTANCE */}
            {toolMode ===
              "distance" && (
              <div className="measurement-panel">

                <div>
                  <strong>
                    Distance Measurement
                  </strong>

                  <p>
                    Click two raster cells on the map.
                  </p>
                </div>

                <div className="measurement-status">

                  <span>
                    Points:{" "}
                    {
                      measurementPoints.length
                    }
                    /2
                  </span>

                  {distanceResult && (
                    <strong>
                      Distance:{" "}
                      {formatNumber(
                        distanceResult.value
                      )}{" "}
                      {
                        distanceResult.unit
                      }

                      {distanceResult.unit ===
                        "meters" &&
                        distanceResult.value >=
                          1000 &&
                        ` (${formatNumber(
                          distanceResult.value /
                            1000
                        )} km)`}
                    </strong>
                  )}

                </div>

              </div>
            )}

            {/* AREA */}
            {toolMode ===
              "area" && (
              <div className="measurement-panel">

                <div>
                  <strong>
                    Area Measurement
                  </strong>

                  <p>
                    Click cells to select or deselect them.
                  </p>
                </div>

                <div className="measurement-status">

                  <span>
                    Selected cells:{" "}
                    {areaCells.length}
                  </span>

                  {areaResult && (
                    <strong>
                      Area:{" "}
                      {formatNumber(
                        areaResult.area
                      )}{" "}
                      {
                        areaResult.unit
                      }
                    </strong>
                  )}

                </div>

              </div>
            )}

            {/* MAP */}
            <div className="map-wrapper">

              <div className="north-arrow">
                <span>N</span>
                ↑
              </div>

              <div className="y-axis">

                {grid.map(
                  (
                    _,
                    rowIndex
                  ) => (
                    <span
                      key={
                        rowIndex
                      }
                    >
                      {getYAxisLabel(
                        rowIndex
                      )}
                    </span>
                  )
                )}

              </div>

              <div className="map-area">

                <div
                  className="coordinate-map"
                  style={{
                    transform:
                      `scale(${mapZoom})`,
                    gridTemplateColumns:
                      `repeat(${cols}, 18px)`,
                  }}
                >

                  {grid.map(
                    (
                      row,
                      rowIndex
                    ) =>
                      row.map(
                        (
                          value,
                          colIndex
                        ) => {
                          const key =
                            `${rowIndex}-${colIndex}`;

                          const coordinate =
                            getMapCoordinate(
                              rowIndex,
                              colIndex
                            );

                          const isAreaSelected =
                            areaCells.includes(
                              key
                            );

                          const isDistancePoint =
                            measurementPoints.some(
                              (
                                point
                              ) =>
                                point.row ===
                                  rowIndex &&
                                point.col ===
                                  colIndex
                            );

                          let cellBackground =
                            "#eef2f7";

                          if (
                            normalizedGrid.length
                          ) {
                            cellBackground =
                              getHeatmapColor(
                                normalizedGrid[
                                  rowIndex
                                ][
                                  colIndex
                                ]
                              );
                          }

                          return (
                            <div
                              key={
                                key
                              }
                              className={`map-cell ${
                                isAreaSelected
                                  ? "area-selected"
                                  : ""
                              } ${
                                isDistancePoint
                                  ? "distance-point"
                                  : ""
                              }`}
                              style={{
                                background:
                                  cellBackground,
                              }}
                              onMouseEnter={() =>
                                setHoveredPixel(
                                  {
                                    row: rowIndex,
                                    col: colIndex,
                                    value,
                                    coordinate,
                                  }
                                )
                              }
                              onMouseLeave={() =>
                                setHoveredPixel(
                                  null
                                )
                              }
                              onClick={() =>
                                handleMapCellClick(
                                  rowIndex,
                                  colIndex
                                )
                              }
                            >
                              {value !==
                              null
                                ? ""
                                : "×"}
                            </div>
                          );
                        }
                      )
                  )}

                </div>

                {hoveredPixel && (
                  <div className="hover-info">

                    <strong>
                      Pixel{" "}
                      {hoveredPixel.row +
                        1}
                      ,
                      {hoveredPixel.col +
                        1}
                    </strong>

                    <span>
                      Value:{" "}
                      {hoveredPixel.value ??
                        "NoData"}
                    </span>

                    <span>
                      X:{" "}
                      {hoveredPixel.coordinate
                        ? formatCoordinate(
                            hoveredPixel
                              .coordinate.x
                          )
                        : "N/A"}
                    </span>

                    <span>
                      Y:{" "}
                      {hoveredPixel.coordinate
                        ? formatCoordinate(
                            hoveredPixel
                              .coordinate.y
                          )
                        : "N/A"}
                    </span>

                  </div>
                )}

              </div>

            </div>

            {/* X AXIS */}
            <div
              className="x-axis"
              style={{
                gridTemplateColumns:
                  `repeat(${cols}, 18px)`,
              }}
            >

              {grid[0]?.map(
                (
                  _,
                  colIndex
                ) => (
                  <span
                    key={
                      colIndex
                    }
                  >
                    {getXAxisLabel(
                      colIndex
                    )}
                  </span>
                )
              )}

            </div>

            <div className="map-extent">

              <span>
                X-axis: longitude /
                projected X
              </span>

              <span>
                Y-axis: latitude /
                projected Y
              </span>

            </div>

          </section>
        )}

      {/* STATISTICS */}
      {displayStatistics && (
        <section className="card">

          <div className="section-title">

            <div>
              <h2>
                Raster Statistics
              </h2>

              <p>
                Descriptive statistics of raster values
              </p>
            </div>

            <div className="badge">
              {
                displayStatistics.count
              }{" "}
              valid pixels
            </div>

          </div>

          <div className="statistics-grid">

            <div className="stat-box">
              <span>
                Minimum
              </span>

              <strong>
                {formatNumber(
                  displayStatistics.min
                )}
              </strong>
            </div>

            <div className="stat-box">
              <span>
                Maximum
              </span>

              <strong>
                {formatNumber(
                  displayStatistics.max
                )}
              </strong>
            </div>

            <div className="stat-box">
              <span>
                Range
              </span>

              <strong>
                {formatNumber(
                  displayStatistics.range
                )}
              </strong>
            </div>

            <div className="stat-box">
              <span>
                Mean
              </span>

              <strong>
                {formatNumber(
                  displayStatistics.mean
                )}
              </strong>
            </div>

            <div className="stat-box">
              <span>
                Median
              </span>

              <strong>
                {formatNumber(
                  displayStatistics.median
                )}
              </strong>
            </div>

            <div className="stat-box">
              <span>
                Sum
              </span>

              <strong>
                {formatNumber(
                  displayStatistics.sum
                )}
              </strong>
            </div>

            <div className="stat-box">
              <span>
                Variance
              </span>

              <strong>
                {formatNumber(
                  displayStatistics.variance
                )}
              </strong>
            </div>

            <div className="stat-box">
              <span>
                Std. Deviation
              </span>

              <strong>
                {formatNumber(
                  displayStatistics.standardDeviation
                )}
              </strong>
            </div>

            <div className="stat-box">
              <span>
                NoData
              </span>

              <strong>
                {
                  displayStatistics.noDataCount
                }
              </strong>
            </div>

          </div>

        </section>
      )}

      {/* HISTOGRAM */}
      {histogram.length >
        0 && (
        <section className="card">

          <div className="section-title">

            <div>
              <h2>
                Value Distribution
              </h2>

              <p>
                Histogram of raster pixel values
              </p>
            </div>

          </div>

          <div className="histogram">

            {histogram.map(
              (
                bin,
                index
              ) => {
                const maxCount =
                  Math.max(
                    ...histogram.map(
                      (item) =>
                        item.count
                    )
                  );

                const height =
                  maxCount === 0
                    ? 0
                    : (bin.count /
                        maxCount) *
                      100;

                return (
                  <div
                    className="histogram-column"
                    key={index}
                  >

                    <div className="histogram-count">
                      {bin.count}
                    </div>

                    <div
                      className="histogram-bar"
                      style={{
                        height:
                          `${Math.max(
                            4,
                            height
                          )}%`,
                      }}
                    ></div>

                    <div className="histogram-label">
                      {formatNumber(
                        bin.start
                      )}
                    </div>

                  </div>
                );
              }
            )}

          </div>

          <div className="histogram-axis">

            <span>
              Lower values
            </span>

            <span>
              Higher values
            </span>

          </div>

        </section>
      )}

      {/* FULL RASTER */}
      {geoInfo && (
        <section className="card">

          <div className="section-title">

            <div>
              <h2>
                Full Raster Statistics
              </h2>

              <p>
                Original GeoTIFF information
              </p>
            </div>

          </div>

          <div className="full-stat-box">

            <div>
              <span>
                Original Raster
              </span>

              <strong>
                {geoInfo.width} ×{" "}
                {geoInfo.height}
              </strong>
            </div>

            <div>
              <span>
                Total Pixels
              </span>

              <strong>
                {(
                  geoInfo.width *
                  geoInfo.height
                ).toLocaleString()}
              </strong>
            </div>

          </div>

          <p className="note">
            The application currently
            analyses a maximum 30 × 30
            preview to keep browser
            memory usage safe for very
            large GeoTIFF files.
          </p>

        </section>
      )}

      {/* NORMALIZATION */}
      {grid.length > 0 && (
        <section className="card">

          <div className="section-title">

            <div>
              <h2>
                Raster Normalization
              </h2>

              <p>
                Convert raster values to a 0–1 scale
              </p>
            </div>

            <button
              className="primary-button"
              onClick={
                normalizeGrid
              }
            >
              Normalize Raster
            </button>

          </div>

          {normalizedGrid.length >
            0 && (
            <>

              <div
                className="heatmap"
                style={{
                  gridTemplateColumns:
                    `repeat(${cols}, 25px)`,
                }}
              >

                {normalizedGrid.map(
                  (
                    row,
                    rowIndex
                  ) =>
                    row.map(
                      (
                        value,
                        colIndex
                      ) => (
                        <div
                          key={`${rowIndex}-${colIndex}`}
                          className="heatmap-cell"
                          style={{
                            background:
                              getHeatmapColor(
                                value
                              ),
                          }}
                          title={
                            value ===
                            null
                              ? "NoData"
                              : value.toFixed(
                                  4
                                )
                          }
                        >
                          {value ===
                          null
                            ? "×"
                            : ""}
                        </div>
                      )
                    )
                )}

              </div>

              <div className="gradient-legend">

                <span>
                  0
                </span>

                <div className="gradient"></div>

                <span>
                  1
                </span>

              </div>

            </>
          )}

        </section>
      )}

      {/* CLASSIFICATION */}
      {grid.length > 0 && (
        <section className="card">

          <div className="section-title">

            <div>
              <h2>
                Raster Classification
              </h2>

              <p>
                Reclassify raster values into thematic classes
              </p>
            </div>

          </div>

          <div className="classification-controls">

            <div className="input-group">

              <label>
                Classification Method
              </label>

              <select
                value={
                  classificationMethod
                }
                onChange={(e) =>
                  setClassificationMethod(
                    e.target.value
                  )
                }
              >

                <option value="equal">
                  Equal Interval
                </option>

                <option value="quantile">
                  Quantile
                </option>

              </select>

            </div>

            <div className="input-group">

              <label>
                Number of Classes
              </label>

              <select
                value={
                  classificationClasses
                }
                onChange={(e) =>
                  setClassificationClasses(
                    Number(
                      e.target.value
                    )
                  )
                }
              >

                {Array.from(
                  {
                    length: 9,
                  },
                  (_, index) => (
                    <option
                      key={
                        index + 2
                      }
                      value={
                        index + 2
                      }
                    >
                      {index + 2}
                    </option>
                  )
                )}

              </select>

            </div>

            <button
              className="primary-button"
              onClick={
                classifyRaster
              }
            >
              Classify Raster
            </button>

          </div>

          {classifiedGrid.length >
            0 && (
            <>

              <div
                className="classified-grid"
                style={{
                  gridTemplateColumns:
                    `repeat(${cols}, 30px)`,
                }}
              >

                {classifiedGrid.map(
                  (
                    row,
                    rowIndex
                  ) =>
                    row.map(
                      (
                        classNumber,
                        colIndex
                      ) => (
                        <div
                          key={`${rowIndex}-${colIndex}`}
                          className="class-cell"
                          style={{
                            background:
                              getClassColor(
                                classNumber
                              ),
                          }}
                        >
                          {classNumber ??
                            "×"}
                        </div>
                      )
                    )
                )}

              </div>

              <div className="class-legend">

                {classBreaks.map(
                  (
                    breakValue,
                    index
                  ) => {
                    const lower =
                      index ===
                      0
                        ? displayStatistics?.min
                        : classBreaks[
                            index - 1
                          ];

                    return (
                      <div
                        className="legend-item"
                        key={index}
                      >

                        <span
                          className="legend-color"
                          style={{
                            background:
                              getClassColor(
                                index +
                                  1
                              ),
                          }}
                        ></span>

                        <span>
                          Class{" "}
                          {index +
                            1}
                          :{" "}
                          {formatNumber(
                            lower
                          )}{" "}
                          –{" "}
                          {formatNumber(
                            breakValue
                          )}
                        </span>

                      </div>
                    );
                  }
                )}

              </div>

            </>
          )}

        </section>
      )}

      {/* FOOTER */}
      <footer className="footer">

        <div>

          <strong>
            39GeoGrid
          </strong>

          <span>
            Raster GIS Analysis Tool
          </span>

        </div>

        <div>
          GeoTIFF • Raster • Coordinate •
          Statistical Analysis
        </div>

      </footer>

    </div>
  );
}

export default App;