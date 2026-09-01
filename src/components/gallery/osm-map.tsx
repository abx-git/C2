"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  OSM_MAX_ZOOM,
  OSM_MIN_ZOOM,
  OSM_TILE_SIZE,
  boundsCenter,
  fitZoom,
  latToTileY,
  lngToTileX,
  osmTileUrl,
  tileXToLng,
  tileYToLat,
  type LatLng,
} from "@/lib/osm";

export type MapMarker = LatLng & {
  id: string;
};

type OsmMapProps = {
  markers: MapMarker[];
  activeId?: string | null;
  traveledIds?: Set<string>;
  onSelect?: (id: string) => void;
  className?: string;
};

type View = {
  zoom: number;
  lat: number;
  lng: number;
};

function tilesForView(view: View, width: number, height: number) {
  const cx = lngToTileX(view.lng, view.zoom);
  const cy = latToTileY(view.lat, view.zoom);
  const originX = cx * OSM_TILE_SIZE - width / 2;
  const originY = cy * OSM_TILE_SIZE - height / 2;
  const startX = Math.floor(originX / OSM_TILE_SIZE);
  const startY = Math.floor(originY / OSM_TILE_SIZE);
  const endX = Math.floor((originX + width) / OSM_TILE_SIZE);
  const endY = Math.floor((originY + height) / OSM_TILE_SIZE);
  const n = 2 ** view.zoom;
  const tiles: { key: string; x: number; y: number; left: number; top: number; url: string }[] = [];
  for (let x = startX; x <= endX; x += 1) {
    for (let y = startY; y <= endY; y += 1) {
      if (y < 0 || y >= n) continue;
      tiles.push({
        key: `${view.zoom}/${x}/${y}`,
        x,
        y,
        left: x * OSM_TILE_SIZE - originX,
        top: y * OSM_TILE_SIZE - originY,
        url: osmTileUrl(view.zoom, x, y),
      });
    }
  }
  return { tiles, originX, originY };
}

function project(point: LatLng, view: View, originX: number, originY: number) {
  return {
    x: lngToTileX(point.lng, view.zoom) * OSM_TILE_SIZE - originX,
    y: latToTileY(point.lat, view.zoom) * OSM_TILE_SIZE - originY,
  };
}

export function OsmMap({ markers, activeId, traveledIds, onSelect, className }: OsmMapProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ zoom: 4, lat: 20, lng: 0 });
  const fitted = useRef(false);
  const drag = useRef<{ x: number; y: number; view: View } | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const markerKey = markers.map((item) => `${item.id}:${item.lat}:${item.lng}`).join("|");

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: Math.floor(el.clientWidth), h: Math.floor(el.clientHeight) });
    });
    ro.observe(el);
    setSize({ w: Math.floor(el.clientWidth), h: Math.floor(el.clientHeight) });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!markers.length || size.w < 8 || size.h < 8) return;
    const zoom = fitZoom(markers, size.w, size.h);
    const center = boundsCenter(markers);
    setView({ zoom, lat: center.lat, lng: center.lng });
    fitted.current = true;
  }, [markerKey, markers, size.w, size.h]);

  const active = markers.find((item) => item.id === activeId) ?? null;
  useEffect(() => {
    if (!active || !fitted.current) return;
    setView((current) => ({ ...current, lat: active.lat, lng: active.lng }));
  }, [active?.id, active?.lat, active?.lng]);

  const { tiles, originX, originY } = useMemo(
    () => tilesForView(view, size.w, size.h),
    [view, size.w, size.h],
  );

  const points = markers.map((marker) => ({
    marker,
    pos: project(marker, view, originX, originY),
  }));

  const line = points
    .map((item) => `${item.pos.x.toFixed(1)},${item.pos.y.toFixed(1)}`)
    .join(" ");

  const traveled = traveledIds
    ? points.filter((item) => traveledIds.has(item.marker.id))
    : points;
  const traveledLine = traveled
    .map((item) => `${item.pos.x.toFixed(1)},${item.pos.y.toFixed(1)}`)
    .join(" ");

  const setZoom = (nextZoom: number, around?: { x: number; y: number }) => {
    const current = viewRef.current;
    const zoom = Math.max(OSM_MIN_ZOOM, Math.min(OSM_MAX_ZOOM, nextZoom));
    if (zoom === current.zoom) return;
    const layout = tilesForView(current, size.w, size.h);
    const pivotX = around?.x ?? size.w / 2;
    const pivotY = around?.y ?? size.h / 2;
    const tileX = (layout.originX + pivotX) / OSM_TILE_SIZE;
    const tileY = (layout.originY + pivotY) / OSM_TILE_SIZE;
    const lng = tileXToLng(tileX, current.zoom);
    const lat = tileYToLat(tileY, current.zoom);
    const nextTileX = lngToTileX(lng, zoom);
    const nextTileY = latToTileY(lat, zoom);
    const nextOriginX = nextTileX * OSM_TILE_SIZE - pivotX;
    const nextOriginY = nextTileY * OSM_TILE_SIZE - pivotY;
    const centerTileX = (nextOriginX + size.w / 2) / OSM_TILE_SIZE;
    const centerTileY = (nextOriginY + size.h / 2) / OSM_TILE_SIZE;
    setView({
      zoom,
      lng: tileXToLng(centerTileX, zoom),
      lat: tileYToLat(centerTileY, zoom),
    });
  };

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      const delta = event.deltaY > 0 ? -1 : 1;
      setZoom(viewRef.current.zoom + delta, { x: event.clientX - rect.left, y: event.clientY - rect.top });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [size.w, size.h]);

  return (
    <div
      ref={rootRef}
      className={["rt-map-canvas", className].filter(Boolean).join(" ")}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        drag.current = { x: event.clientX, y: event.clientY, view };
      }}
      onPointerMove={(event) => {
        const start = drag.current;
        if (!start) return;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        const tileX = lngToTileX(start.view.lng, start.view.zoom) - dx / OSM_TILE_SIZE;
        const tileY = latToTileY(start.view.lat, start.view.zoom) - dy / OSM_TILE_SIZE;
        setView({
          zoom: start.view.zoom,
          lng: tileXToLng(tileX, start.view.zoom),
          lat: tileYToLat(tileY, start.view.zoom),
        });
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
    >
      {tiles.map((tile) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={tile.key}
          className="rt-map-tile"
          src={tile.url}
          alt=""
          draggable={false}
          style={{ left: tile.left, top: tile.top, width: OSM_TILE_SIZE, height: OSM_TILE_SIZE }}
        />
      ))}
      <svg className="rt-map-svg" width={size.w} height={size.h}>
        {points.length > 1 ? (
          <polyline className="rt-map-route" points={line} />
        ) : null}
        {traveled.length > 1 ? (
          <polyline className="rt-map-route-traveled" points={traveledLine} />
        ) : null}
        {points.map(({ marker, pos }) => {
          const activeMark = marker.id === activeId;
          const done = traveledIds?.has(marker.id) ?? false;
          return (
            <g key={marker.id} transform={`translate(${pos.x} ${pos.y})`}>
              <circle
                className={`rt-map-pin${activeMark ? " is-active" : ""}${done ? " is-traveled" : ""}`}
                r={activeMark ? 7 : 4.5}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect?.(marker.id);
                }}
              />
            </g>
          );
        })}
      </svg>
      <div className="rt-map-zoom">
        <button type="button" aria-label="Hineinzoomen" onClick={() => setZoom(view.zoom + 1)}>
          +
        </button>
        <button type="button" aria-label="Herauszoomen" onClick={() => setZoom(view.zoom - 1)}>
          −
        </button>
      </div>
      <p className="rt-map-copy">
        ©{" "}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          OpenStreetMap
        </a>
      </p>
    </div>
  );
}
