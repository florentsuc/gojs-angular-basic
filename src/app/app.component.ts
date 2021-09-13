/**
 * Sample app showcasing gojs-angular components
 * For use with gojs-angular version 2.x
 */

import { ChangeDetectorRef, Component, ViewChild, ViewEncapsulation } from '@angular/core';
import * as go from 'gojs';
import { DataSyncService, DiagramComponent, PaletteComponent } from 'gojs-angular';
import produce from "immer";

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  encapsulation: ViewEncapsulation.ShadowDom
})
export class AppComponent {

  @ViewChild('myDiagram', { static: true }) public myDiagramComponent: DiagramComponent;
  @ViewChild('myPalette', { static: true }) public myPaletteComponent: PaletteComponent;

  // Big object that holds app-level state data
  // As of gojs-angular 2.0, immutability is expected and required of state for ease of change detection.
  // Whenever updating state, immutability must be preserved. It is recommended to use immer for this, a small package that makes working with immutable data easy.
  public state = {
    // Diagram state props
    diagramNodeData: [
      { id: 'Alpha', text: "Alpha", color: 'lightblue', imgSrc: 'assets/tiger.svg' },
    ],
    diagramLinkData: [],
    diagramModelData: { prop: 'value' },
    skipsDiagramUpdate: false,
    selectedNodeData: null, // used by InspectorComponent

    // Palette state props
    paletteNodeData: [
      { key: 'PaletteNode1', color: 'firebrick' },
      { key: 'PaletteNode2', color: 'blueviolet' }
    ],
    paletteModelData: { prop: 'val' }
  };
  
  public diagramDivClassName: string = 'myDiagramDiv';
  public paletteDivClassName = 'myPaletteDiv';

  // initialize diagram / templates
  public initDiagram(): go.Diagram {

    const $ = go.GraphObject.make;
    const dia = $(go.Diagram, {
      'undoManager.isEnabled': true,
      'clickCreatingTool.archetypeNodeData': { text: 'new node', color: 'lightblue' },
      model: $(go.GraphLinksModel,
        {
          nodeKeyProperty: 'id',
          linkToPortIdProperty: 'toPort',
          linkFromPortIdProperty: 'fromPort',
          linkKeyProperty: 'key' // IMPORTANT! must be defined for merges and data sync when using GraphLinksModel
        }
      )
    });

    dia.commandHandler.archetypeGroupData = { key: 'Group', isGroup: true };

    const makePort = function(id: string, spot: go.Spot) {
      return $(go.Shape, 'Circle',
        {
          opacity: .5,
          fill: 'gray', strokeWidth: 0, desiredSize: new go.Size(8, 8),
          portId: id, alignment: spot,
          fromLinkable: true, toLinkable: true
        }
      );
    }

    // define the Node template
    dia.nodeTemplate =
      $(go.Node, 'Spot',
        {
          contextMenu:
            $('ContextMenu',
              $('ContextMenuButton',
                $(go.TextBlock, 'Group'),
                { click: function(e, obj) { e.diagram.commandHandler.groupSelection(); } },
                new go.Binding('visible', '', function(o) {
                  return o.diagram.selection.count > 1;
                }).ofObject())
            )
        },
        $(go.Panel, 'Auto',
          $(
            go.Picture,
            {
              width: 200,
              height: 200,
            },
            new go.Binding('source', 'imgSrc')
          ),
        ),
        // Ports
        makePort('t', go.Spot.TopCenter),
        makePort('l', go.Spot.Left),
        makePort('r', go.Spot.Right),
        makePort('b', go.Spot.BottomCenter)
      );

    dia.animationManager.isEnabled = false;

    return dia;
  }

  // When the diagram model changes, update app data to reflect those changes. Be sure to use immer's "produce" function to preserve immutability
  public diagramModelChange = function(changes: go.IncrementalData) {
    const appComp = this;
    this.state = produce(this.state, draft => {
      // set skipsDiagramUpdate: true since GoJS already has this update
      // this way, we don't log an unneeded transaction in the Diagram's undoManager history
      draft.skipsDiagramUpdate = true;
      draft.diagramNodeData = DataSyncService.syncNodeData(changes, draft.diagramNodeData, appComp.observedDiagram.model);
      draft.diagramLinkData = DataSyncService.syncLinkData(changes, draft.diagramLinkData, appComp.observedDiagram.model);
      draft.diagramModelData = DataSyncService.syncModelData(changes, draft.diagramModelData);
    });
  };

  public initPalette(): go.Palette {
    const $ = go.GraphObject.make;
    const palette = $(go.Palette);

    // define the Node template
    palette.nodeTemplate =
      $(go.Node, 'Auto',
        $(go.Shape, 'RoundedRectangle',
          {
            stroke: null
          },
          new go.Binding('fill', 'color')
        ),
        $(go.TextBlock, { margin: 8 },
          new go.Binding('text', 'key'))
      );

    palette.model = $(go.GraphLinksModel);
    return palette;
  }

  constructor(private cdr: ChangeDetectorRef) { }

  // Overview Component testing
  public oDivClassName = 'myOverviewDiv';
  public initOverview(): go.Overview {
    const $ = go.GraphObject.make;
    const overview = $(go.Overview);
    return overview;
  }
  public observedDiagram = null;

  // currently selected node; for inspector
  public selectedNodeData: go.ObjectData = null;

  public ngAfterViewInit() {
    if (this.observedDiagram) return;
    this.observedDiagram = this.myDiagramComponent.diagram;
    this.cdr.detectChanges(); // IMPORTANT: without this, Angular will throw ExpressionChangedAfterItHasBeenCheckedError (dev mode only)

    const appComp: AppComponent = this;
    // listener for inspector
    this.myDiagramComponent.diagram.addDiagramListener('ChangedSelection', function(e) {
      if (e.diagram.selection.count === 0) {
        appComp.selectedNodeData = null;
      }
      const node = e.diagram.selection.first();
      appComp.state = produce(appComp.state, draft => {
        if (node instanceof go.Node) {
          var idx = draft.diagramNodeData.findIndex(nd => nd.id == node.data.id);
          var nd = draft.diagramNodeData[idx];
          draft.selectedNodeData = nd;
        } else {
          draft.selectedNodeData = null;
        }
      });
    });
  } // end ngAfterViewInit


  /**
   * Update a node's data based on some change to an inspector row's input
   * @param changedPropAndVal An object with 2 entries: "prop" (the node data prop changed), and "newVal" (the value the user entered in the inspector <input>)
   */
  public handleInspectorChange(changedPropAndVal) {

    const path = changedPropAndVal.prop;
    const value = changedPropAndVal.newVal;

    this.state = produce(this.state, draft => {
      var data = draft.selectedNodeData;
      data[path] = value;
      const key = data.id;
      const idx = draft.diagramNodeData.findIndex(nd => nd.id == key);
      if (idx >= 0) {
        draft.diagramNodeData[idx] = data;
        draft.skipsDiagramUpdate = false; // we need to sync GoJS data with this new app state, so do not skips Diagram update
      }
    });
  }


}

