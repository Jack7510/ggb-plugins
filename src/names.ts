/**
 * @fileoverview Central naming policy for newly declared GeoGebra objects.
 * Reserved labels follow the official Naming Objects manual. Command shadowing
 * protection mirrors docs/command-catalog.json, retrieved 2026-10-16.
 */
import assert from 'node:assert/strict';

// https://geogebra.github.io/docs/manual/en/Naming_Objects/
const reservedNames = new Set([
  'x', 'y', 'z', 'xAxis', 'yAxis', 'zAxis', 'abs', 'sgn', 'sqrt',
  'exp', 'log', 'ln', 'ld', 'lg', 'cos', 'sin', 'tan', 'acos', 'arcos',
  'arccos', 'asin', 'arcsin', 'atan', 'arctan', 'cosh', 'sinh', 'tanh',
  'acosh', 'arcosh', 'arccosh', 'asinh', 'arcsinh', 'atanh', 'arctanh',
  'atan2', 'erf', 'floor', 'ceil', 'round', 'random', 'conjugate', 'arg',
  'gamma', 'gammaRegularized', 'beta', 'betaRegularized', 'sec', 'csc',
  'cosec', 'cot', 'sech', 'csch', 'coth',
]);

// Plugin policy, not an additional claim about engine-reserved labels.
// https://geogebra.github.io/docs/manual/en/Predefined_Functions_and_Operators/
// Preserve documented functions, constants and English parser operators.
const protectedNames = new Set([
  'e', 'i', 'pi', 'true', 'false', 'and', 'or', 'not', 'xor', 'if',
  'else', 'elseif', 'then', 'in',
  'deg', 'nPr', 'real', 'imaginary', 'alt', 'sign', 'cbrt', 'nroot',
  'cotan', 'acosd', 'asind', 'atand', 'atan2d', 'cotanh', 'psi',
  'polygamma', 'sinIntegral', 'cosIntegral', 'expIntegral', 'zeta',
  'LambertW',
]);

// Official command catalog snapshot; parity is checked in the schema tests.
const commandNames = new Set([
  'ANOVA', 'AffineRatio', 'Angle', 'AngleBisector', 'Append', 'ApplyMatrix',
  'Arc', 'AreCollinear', 'AreConcurrent', 'AreConcyclic', 'AreCongruent',
  'AreEqual', 'AreParallel', 'ArePerpendicular', 'Area', 'Assume',
  'Asymptote', 'AttachCopyToView', 'Axes', 'AxisStepX', 'AxisStepY',
  'BarChart', 'Barycenter', 'Bernoulli', 'BetaDist', 'BinomialDist',
  'Bottom', 'BoxPlot', 'Button', 'CASLoaded', 'CFactor', 'CIFactor',
  'CSolutions', 'CSolve', 'Cauchy', 'Cell', 'CellRange', 'Center',
  'CenterView', 'Centroid', 'CharacteristicPolynomial', 'Checkbox',
  'ChiSquared', 'ChiSquaredTest', 'Circle', 'CircularArc', 'CircularSector',
  'CircumcircularArc', 'CircumcircularSector', 'Circumference', 'Classes',
  'ClosestPoint', 'ClosestPointRegion', 'Coefficients', 'Column',
  'ColumnName', 'CommonDenominator', 'CompleteSquare', 'ComplexRoot', 'Cone',
  'Conic', 'ConjugateDiameter', 'ConstructionStep', 'ContingencyTable',
  'ContinuedFraction', 'ConvexHull', 'CopyFreeObject', 'Corner',
  'CorrelationCoefficient', 'CountIf', 'Covariance', 'Cross', 'CrossRatio',
  'Cube', 'Cubic', 'Curvature', 'CurvatureVector', 'Curve', 'Cylinder',
  'DataFunction', 'Degree', 'DelaunayTriangulation', 'Delete', 'Denominator',
  'Derivative', 'Determinant', 'Difference', 'Dilate', 'Dimension',
  'Direction', 'Directrix', 'Distance', 'Div', 'Division', 'Divisors',
  'DivisorsList', 'DivisorsSum', 'Dodecahedron', 'Dot', 'DotPlot',
  'DynamicCoordinates', 'Eccentricity', 'Eigenvalues', 'Eigenvectors',
  'Element', 'Eliminate', 'Ellipse', 'Ends', 'Envelope', 'Erlang', 'Execute',
  'Expand', 'Exponential', 'ExportImage', 'ExtendedGCD', 'Extremum',
  'FDistribution', 'Factor', 'Factors', 'FillCells', 'FillColumn', 'FillRow',
  'First', 'Fit', 'FitExp', 'FitGrowth', 'FitImplicit', 'FitLine',
  'FitLineX', 'FitLog', 'FitLogistic', 'FitPoly', 'FitPow', 'FitSin',
  'Flatten', 'Focus', 'FormulaText', 'FractionText', 'Frequency',
  'FrequencyPolygon', 'FrequencyTable', 'FromBase', 'Function',
  'FutureValue', 'GCD', 'Gamma', 'GeometricMean', 'GetTime',
  'GroebnerDegRevLex', 'GroebnerLex', 'GroebnerLexDeg', 'HarmonicMean',
  'Height', 'HideLayer', 'Histogram', 'HistogramRight', 'HyperGeometric',
  'Hyperbola', 'IFactor', 'Icosahedron', 'Identity', 'If', 'ImplicitCurve',
  'ImplicitDerivative', 'Incircle', 'IndexOf', 'InfiniteCone',
  'InfiniteCylinder', 'InflectionPoint', 'InputBox', 'Insert', 'Integral',
  'IntegralBetween', 'IntegralSymbolic', 'InteriorAngles', 'Intersect',
  'IntersectConic', 'IntersectPath', 'Intersection', 'InverseBeta',
  'InverseBinomial', 'InverseBinomialMinimumTrials', 'InverseCauchy',
  'InverseChiSquared', 'InverseExponential', 'InverseFDistribution',
  'InverseGamma', 'InverseHyperGeometric', 'InverseLaplace',
  'InverseLogNormal', 'InverseLogistic', 'InverseNormal', 'InversePascal',
  'InversePoisson', 'InverseTDistribution', 'InverseWeibull', 'InverseZipf',
  'Invert', 'IsDefined', 'IsFactored', 'IsInRegion', 'IsInteger', 'IsPrime',
  'IsTangent', 'IsVertexForm', 'Iteration', 'IterationList', 'Join',
  'JordanDiagonalization', 'KeepIf', 'LCM', 'LUDecomposition', 'Laplace',
  'Last', 'LeftSide', 'LeftSum', 'Length', 'LetterToUnicode', 'Limit',
  'LimitAbove', 'LimitBelow', 'Line', 'LineGraph', 'LinearEccentricity',
  'Locus', 'LocusEquation', 'LogNormal', 'Logistic', 'LowerSum', 'MAD',
  'MajorAxis', 'MatrixRank', 'Max', 'Maximize', 'Mean', 'MeanX', 'MeanY',
  'Median', 'Midpoint', 'Min', 'MinimalPolynomial', 'Minimize',
  'MinimumSpanningTree', 'MinorAxis', 'MixedNumber', 'Mod', 'Mode',
  'ModularExponent', 'NDerivative', 'NIntegral', 'NInvert', 'NSolutions',
  'NSolve', 'NSolveODE', 'Name', 'Net', 'NextPrime', 'Normal',
  'NormalQuantilePlot', 'Normalize', 'Numerator', 'Numeric', 'Object',
  'Octahedron', 'Ordinal', 'OrdinalRank', 'OsculatingCircle', 'Pan',
  'Parabola', 'Parameter', 'ParametricDerivative', 'ParseToFunction',
  'ParseToNumber', 'PartialFractions', 'Pascal', 'PathParameter', 'Payment',
  'Percentile', 'Perimeter', 'Periods', 'PerpendicularBisector',
  'PerpendicularLine', 'PerpendicularPlane', 'PerpendicularVector',
  'PieChart', 'Plane', 'PlaneBisector', 'PlaySound', 'PlotSolve', 'Point',
  'PointIn', 'PointList', 'Poisson', 'Polar', 'Polygon', 'Polyline',
  'Polynomial', 'PresentValue', 'PreviousPrime', 'PrimeFactors', 'Prism',
  'Product', 'Prove', 'ProveDetails', 'Pyramid', 'QRDecomposition',
  'Quartile1', 'Quartile3', 'RSquare', 'Radius', 'RandomBetween',
  'RandomBinomial', 'RandomDiscrete', 'RandomElement', 'RandomNormal',
  'RandomPointIn', 'RandomPoisson', 'RandomPolynomial', 'RandomUniform',
  'Rate', 'Rationalize', 'Ray', 'ReadText', 'RectangleSum',
  'ReducedRowEchelonForm', 'Reflect', 'Relation', 'RemovableDiscontinuity',
  'Remove', 'RemoveUndefined', 'Rename', 'Repeat', 'ReplaceAll',
  'ResidualPlot', 'Reverse', 'RightSide', 'RigidPolygon', 'Root', 'RootList',
  'RootMeanSquare', 'Roots', 'Rotate', 'RotateText', 'Row', 'RunClickScript',
  'RunUpdateScript', 'SD', 'SDX', 'SDY', 'SVD', 'Sample', 'SampleSD',
  'SampleSDX', 'SampleSDY', 'SampleVariance', 'ScientificText', 'Sector',
  'Segment', 'SelectObjects', 'SelectedElement', 'SelectedIndex',
  'SemiMajorAxisLength', 'SemiMinorAxisLength', 'Semicircle', 'Sequence',
  'SetActiveView', 'SetAxesRatio', 'SetBackgroundColor', 'SetCaption',
  'SetColor', 'SetConditionToShowObject', 'SetConstructionStep', 'SetCoords',
  'SetDecoration', 'SetDynamicColor', 'SetFilling', 'SetFixed', 'SetImage',
  'SetLabelMode', 'SetLayer', 'SetLevelOfDetail', 'SetLineOpacity',
  'SetLineStyle', 'SetLineThickness', 'SetPerspective', 'SetPointSize',
  'SetPointStyle', 'SetSeed', 'SetSpinSpeed', 'SetTooltipMode', 'SetTrace',
  'SetValue', 'SetViewDirection', 'SetVisibleInView', 'Shear',
  'ShortestDistance', 'ShowAxes', 'ShowGrid', 'ShowLabel', 'ShowLayer',
  'Shuffle', 'Side', 'SigmaXX', 'SigmaXY', 'SigmaYY', 'Simplify', 'Slider',
  'Slope', 'SlopeField', 'SlowPlot', 'Solutions', 'Solve', 'SolveCubic',
  'SolveODE', 'SolveQuartic', 'Sort', 'Spearman', 'Sphere', 'Spline',
  'Split', 'StartAnimation', 'StartRecord', 'StemPlot', 'StepGraph',
  'StickGraph', 'Stretch', 'Substitute', 'Sum', 'SumSquaredErrors',
  'SurdText', 'Surface', 'Sxx', 'Sxy', 'Syy', 'TDistribution',
  'TMean2Estimate', 'TMeanEstimate', 'TTest', 'TTest2', 'TTestPaired',
  'TableText', 'Take', 'Tangent', 'TaylorPolynomial', 'Tetrahedron', 'Text',
  'TextToUnicode', 'TiedRank', 'ToBase', 'ToComplex', 'ToExponential',
  'ToPoint', 'ToPolar', 'ToolImage', 'Top', 'Translate', 'Transpose',
  'TrapezoidalSum', 'TravelingSalesman', 'TriangleCenter', 'TriangleCurve',
  'Triangular', 'TrigCombine', 'TrigExpand', 'TrigSimplify', 'Trilinear',
  'Turtle', 'TurtleBack', 'TurtleDown', 'TurtleForward', 'TurtleLeft',
  'TurtleRight', 'TurtleUp', 'Type', 'UnicodeToLetter', 'UnicodeToText',
  'Uniform', 'Union', 'Unique', 'UnitPerpendicularVector', 'UnitVector',
  'UpdateConstruction', 'UpperSum', 'Variance', 'Vector', 'Vertex',
  'VerticalText', 'Volume', 'Voronoi', 'Weibull', 'ZMean2Estimate',
  'ZMean2Test', 'ZMeanEstimate', 'ZMeanTest', 'ZProportion2Estimate',
  'ZProportion2Test', 'ZProportionEstimate', 'ZProportionTest', 'Zip',
  'Zipf', 'ZoomIn', 'ZoomOut',
]);

/** Apply the shared syntax and protection policy to every new object. */
export function validateNewObjectIdentifier(name: unknown):
    asserts name is string {
  assert(typeof name === 'string' && name.length <= 32 &&
    /^[A-Za-z][A-Za-z0-9_]*(?:\{[A-Za-z0-9]+\})?$/u.test(name),
  `Invalid object identifier: ${JSON.stringify(name)}`);
  validateNewObjectName(name);
}

/** Rejects engine-reserved labels and plugin-protected built-in names.
 * The caller validates label syntax. References to existing objects do not call
 * this function. Native execution must still validate actual output identity.
 */
export function validateNewObjectName(name: string): void {
  assert(!reservedNames.has(name), `Reserved GeoGebra name: ${name}`);
  assert(!protectedNames.has(name) && !commandNames.has(name),
    `Protected GeoGebra built-in name: ${name}`);
  assert(!name.startsWith('GgbProbe'),
    `Reserved tool namespace: ${name}`);
}
