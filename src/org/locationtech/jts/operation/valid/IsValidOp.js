import TreeSet from '../../../../../java/util/TreeSet';
import LineString from '../../geom/LineString';
import CGAlgorithms from '../../algorithm/CGAlgorithms';
import Geometry from '../../geom/Geometry';
import ConnectedInteriorTester from './ConnectedInteriorTester';
import Coordinate from '../../geom/Coordinate';
import Point from '../../geom/Point';
import Polygon from '../../geom/Polygon';
import MultiPoint from '../../geom/MultiPoint';
import LinearRing from '../../geom/LinearRing';
import Double from '../../../../../java/lang/Double';
import MCPointInRing from '../../algorithm/MCPointInRing';
import GeometryGraph from '../../geomgraph/GeometryGraph';
import MultiPolygon from '../../geom/MultiPolygon';
import ConsistentAreaTester from './ConsistentAreaTester';
import GeometryCollection from '../../geom/GeometryCollection';
import IndexedNestedRingTester from './IndexedNestedRingTester';
import RobustLineIntersector from '../../algorithm/RobustLineIntersector';
import TopologyValidationError from './TopologyValidationError';
import Assert from '../../util/Assert';
export default class IsValidOp {
	constructor(...args) {
		(() => {
			this.parentGeometry = null;
			this.isSelfTouchingRingFormingHoleValid = false;
			this.validErr = null;
		})();
		const overloads = (...args) => {
			switch (args.length) {
				case 1:
					return ((...args) => {
						let [parentGeometry] = args;
						this.parentGeometry = parentGeometry;
					})(...args);
			}
		};
		return overloads.apply(this, args);
	}
	get interfaces_() {
		return [];
	}
	static findPtNotNode(testCoords, searchRing, graph) {
		var searchEdge = graph.findEdge(searchRing);
		var eiList = searchEdge.getEdgeIntersectionList();
		for (var i = 0; i < testCoords.length; i++) {
			var pt = testCoords[i];
			if (!eiList.isIntersection(pt)) return pt;
		}
		return null;
	}
	static isValid(...args) {
		const overloads = (...args) => {
			switch (args.length) {
				case 1:
					if (args[0] instanceof Geometry) {
						return ((...args) => {
							let [geom] = args;
							var isValidOp = new IsValidOp(geom);
							return isValidOp.isValid();
						})(...args);
					} else if (args[0] instanceof Coordinate) {
						return ((...args) => {
							let [coord] = args;
							if (Double.isNaN(coord.x)) return false;
							if (Double.isInfinite(coord.x)) return false;
							if (Double.isNaN(coord.y)) return false;
							if (Double.isInfinite(coord.y)) return false;
							return true;
						})(...args);
					}
			}
		};
		return overloads.apply(this, args);
	}
	checkInvalidCoordinates(...args) {
		const overloads = (...args) => {
			switch (args.length) {
				case 1:
					if (args[0] instanceof Array) {
						return ((...args) => {
							let [coords] = args;
							for (var i = 0; i < coords.length; i++) {
								if (!IsValidOp.isValid(coords[i])) {
									this.validErr = new TopologyValidationError(TopologyValidationError.INVALID_COORDINATE, coords[i]);
									return null;
								}
							}
						})(...args);
					} else if (args[0] instanceof Polygon) {
						return ((...args) => {
							let [poly] = args;
							this.checkInvalidCoordinates(poly.getExteriorRing().getCoordinates());
							if (this.validErr !== null) return null;
							for (var i = 0; i < poly.getNumInteriorRing(); i++) {
								this.checkInvalidCoordinates(poly.getInteriorRingN(i).getCoordinates());
								if (this.validErr !== null) return null;
							}
						})(...args);
					}
			}
		};
		return overloads.apply(this, args);
	}
	checkHolesNotNested(p, graph) {
		var nestedTester = new IndexedNestedRingTester(graph);
		for (var i = 0; i < p.getNumInteriorRing(); i++) {
			var innerHole = p.getInteriorRingN(i);
			nestedTester.add(innerHole);
		}
		var isNonNested = nestedTester.isNonNested();
		if (!isNonNested) {
			this.validErr = new TopologyValidationError(TopologyValidationError.NESTED_HOLES, nestedTester.getNestedPoint());
		}
	}
	checkConsistentArea(graph) {
		var cat = new ConsistentAreaTester(graph);
		var isValidArea = cat.isNodeConsistentArea();
		if (!isValidArea) {
			this.validErr = new TopologyValidationError(TopologyValidationError.SELF_INTERSECTION, cat.getInvalidPoint());
			return null;
		}
		if (cat.hasDuplicateRings()) {
			this.validErr = new TopologyValidationError(TopologyValidationError.DUPLICATE_RINGS, cat.getInvalidPoint());
		}
	}
	isValid() {
		this.checkValid(this.parentGeometry);
		return this.validErr === null;
	}
	checkShellInsideHole(shell, hole, graph) {
		var shellPts = shell.getCoordinates();
		var holePts = hole.getCoordinates();
		var shellPt = IsValidOp.findPtNotNode(shellPts, hole, graph);
		if (shellPt !== null) {
			var insideHole = CGAlgorithms.isPointInRing(shellPt, holePts);
			if (!insideHole) {
				return shellPt;
			}
		}
		var holePt = IsValidOp.findPtNotNode(holePts, shell, graph);
		if (holePt !== null) {
			var insideShell = CGAlgorithms.isPointInRing(holePt, shellPts);
			if (insideShell) {
				return holePt;
			}
			return null;
		}
		Assert.shouldNeverReachHere("points in shell and hole appear to be equal");
		return null;
	}
	checkNoSelfIntersectingRings(graph) {
		for (var i = graph.getEdgeIterator(); i.hasNext(); ) {
			var e = i.next();
			this.checkNoSelfIntersectingRing(e.getEdgeIntersectionList());
			if (this.validErr !== null) return null;
		}
	}
	checkConnectedInteriors(graph) {
		var cit = new ConnectedInteriorTester(graph);
		if (!cit.isInteriorsConnected()) this.validErr = new TopologyValidationError(TopologyValidationError.DISCONNECTED_INTERIOR, cit.getCoordinate());
	}
	checkNoSelfIntersectingRing(eiList) {
		var nodeSet = new TreeSet();
		var isFirst = true;
		for (var i = eiList.iterator(); i.hasNext(); ) {
			var ei = i.next();
			if (isFirst) {
				isFirst = false;
				continue;
			}
			if (nodeSet.contains(ei.coord)) {
				this.validErr = new TopologyValidationError(TopologyValidationError.RING_SELF_INTERSECTION, ei.coord);
				return null;
			} else {
				nodeSet.add(ei.coord);
			}
		}
	}
	checkHolesInShell(p, graph) {
		var shell = p.getExteriorRing();
		var pir = new MCPointInRing(shell);
		for (var i = 0; i < p.getNumInteriorRing(); i++) {
			var hole = p.getInteriorRingN(i);
			var holePt = IsValidOp.findPtNotNode(hole.getCoordinates(), shell, graph);
			if (holePt === null) return null;
			var outside = !pir.isInside(holePt);
			if (outside) {
				this.validErr = new TopologyValidationError(TopologyValidationError.HOLE_OUTSIDE_SHELL, holePt);
				return null;
			}
		}
	}
	checkTooFewPoints(graph) {
		if (graph.hasTooFewPoints()) {
			this.validErr = new TopologyValidationError(TopologyValidationError.TOO_FEW_POINTS, graph.getInvalidPoint());
			return null;
		}
	}
	getValidationError() {
		this.checkValid(this.parentGeometry);
		return this.validErr;
	}
	checkValid(...args) {
		const overloads = (...args) => {
			switch (args.length) {
				case 1:
					if (args[0] instanceof Point) {
						return ((...args) => {
							let [g] = args;
							this.checkInvalidCoordinates(g.getCoordinates());
						})(...args);
					} else if (args[0] instanceof MultiPoint) {
						return ((...args) => {
							let [g] = args;
							this.checkInvalidCoordinates(g.getCoordinates());
						})(...args);
					} else if (args[0] instanceof LinearRing) {
						return ((...args) => {
							let [g] = args;
							this.checkInvalidCoordinates(g.getCoordinates());
							if (this.validErr !== null) return null;
							this.checkClosedRing(g);
							if (this.validErr !== null) return null;
							var graph = new GeometryGraph(0, g);
							this.checkTooFewPoints(graph);
							if (this.validErr !== null) return null;
							var li = new RobustLineIntersector();
							graph.computeSelfNodes(li, true, true);
							this.checkNoSelfIntersectingRings(graph);
						})(...args);
					} else if (args[0] instanceof LineString) {
						return ((...args) => {
							let [g] = args;
							this.checkInvalidCoordinates(g.getCoordinates());
							if (this.validErr !== null) return null;
							var graph = new GeometryGraph(0, g);
							this.checkTooFewPoints(graph);
						})(...args);
					} else if (args[0] instanceof Polygon) {
						return ((...args) => {
							let [g] = args;
							this.checkInvalidCoordinates(g);
							if (this.validErr !== null) return null;
							this.checkClosedRings(g);
							if (this.validErr !== null) return null;
							var graph = new GeometryGraph(0, g);
							this.checkTooFewPoints(graph);
							if (this.validErr !== null) return null;
							this.checkConsistentArea(graph);
							if (this.validErr !== null) return null;
							if (!this.isSelfTouchingRingFormingHoleValid) {
								this.checkNoSelfIntersectingRings(graph);
								if (this.validErr !== null) return null;
							}
							this.checkHolesInShell(g, graph);
							if (this.validErr !== null) return null;
							this.checkHolesNotNested(g, graph);
							if (this.validErr !== null) return null;
							this.checkConnectedInteriors(graph);
						})(...args);
					} else if (args[0] instanceof MultiPolygon) {
						return ((...args) => {
							let [g] = args;
							for (var i = 0; i < g.getNumGeometries(); i++) {
								var p = g.getGeometryN(i);
								this.checkInvalidCoordinates(p);
								if (this.validErr !== null) return null;
								this.checkClosedRings(p);
								if (this.validErr !== null) return null;
							}
							var graph = new GeometryGraph(0, g);
							this.checkTooFewPoints(graph);
							if (this.validErr !== null) return null;
							this.checkConsistentArea(graph);
							if (this.validErr !== null) return null;
							if (!this.isSelfTouchingRingFormingHoleValid) {
								this.checkNoSelfIntersectingRings(graph);
								if (this.validErr !== null) return null;
							}
							for (var i = 0; i < g.getNumGeometries(); i++) {
								var p = g.getGeometryN(i);
								this.checkHolesInShell(p, graph);
								if (this.validErr !== null) return null;
							}
							for (var i = 0; i < g.getNumGeometries(); i++) {
								var p = g.getGeometryN(i);
								this.checkHolesNotNested(p, graph);
								if (this.validErr !== null) return null;
							}
							this.checkShellsNotNested(g, graph);
							if (this.validErr !== null) return null;
							this.checkConnectedInteriors(graph);
						})(...args);
					} else if (args[0] instanceof GeometryCollection) {
						return ((...args) => {
							let [gc] = args;
							for (var i = 0; i < gc.getNumGeometries(); i++) {
								var g = gc.getGeometryN(i);
								this.checkValid(g);
								if (this.validErr !== null) return null;
							}
						})(...args);
					} else if (args[0] instanceof Geometry) {
						return ((...args) => {
							let [g] = args;
							this.validErr = null;
							if (g.isEmpty()) return null;
							if (g instanceof Point) this.checkValid(g); else if (g instanceof MultiPoint) this.checkValid(g); else if (g instanceof LinearRing) this.checkValid(g); else if (g instanceof LineString) this.checkValid(g); else if (g instanceof Polygon) this.checkValid(g); else if (g instanceof MultiPolygon) this.checkValid(g); else if (g instanceof GeometryCollection) this.checkValid(g); else throw new UnsupportedOperationException(g.getClass().getName());
						})(...args);
					}
			}
		};
		return overloads.apply(this, args);
	}
	setSelfTouchingRingFormingHoleValid(isValid) {
		this.isSelfTouchingRingFormingHoleValid = isValid;
	}
	checkShellNotNested(shell, p, graph) {
		var shellPts = shell.getCoordinates();
		var polyShell = p.getExteriorRing();
		var polyPts = polyShell.getCoordinates();
		var shellPt = IsValidOp.findPtNotNode(shellPts, polyShell, graph);
		if (shellPt === null) return null;
		var insidePolyShell = CGAlgorithms.isPointInRing(shellPt, polyPts);
		if (!insidePolyShell) return null;
		if (p.getNumInteriorRing() <= 0) {
			this.validErr = new TopologyValidationError(TopologyValidationError.NESTED_SHELLS, shellPt);
			return null;
		}
		var badNestedPt = null;
		for (var i = 0; i < p.getNumInteriorRing(); i++) {
			var hole = p.getInteriorRingN(i);
			badNestedPt = this.checkShellInsideHole(shell, hole, graph);
			if (badNestedPt === null) return null;
		}
		this.validErr = new TopologyValidationError(TopologyValidationError.NESTED_SHELLS, badNestedPt);
	}
	checkClosedRings(poly) {
		this.checkClosedRing(poly.getExteriorRing());
		if (this.validErr !== null) return null;
		for (var i = 0; i < poly.getNumInteriorRing(); i++) {
			this.checkClosedRing(poly.getInteriorRingN(i));
			if (this.validErr !== null) return null;
		}
	}
	checkClosedRing(ring) {
		if (!ring.isClosed()) {
			var pt = null;
			if (ring.getNumPoints() >= 1) pt = ring.getCoordinateN(0);
			this.validErr = new TopologyValidationError(TopologyValidationError.RING_NOT_CLOSED, pt);
		}
	}
	checkShellsNotNested(mp, graph) {
		for (var i = 0; i < mp.getNumGeometries(); i++) {
			var p = mp.getGeometryN(i);
			var shell = p.getExteriorRing();
			for (var j = 0; j < mp.getNumGeometries(); j++) {
				if (i === j) continue;
				var p2 = mp.getGeometryN(j);
				this.checkShellNotNested(shell, p2, graph);
				if (this.validErr !== null) return null;
			}
		}
	}
	getClass() {
		return IsValidOp;
	}
}
