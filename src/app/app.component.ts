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
      { id: 'Alpha', text: "Alpha", color: 'lightblue' },
      { id: 'Beta', text: "Beta", color: 'orange' },
      { id: 'Gamma', text: "Gamma", color: 'lightgreen' },
      { id: 'Delta', text: "Delta", color: 'pink' }
    ],
    diagramLinkData: [
        { key: -1, from: 'Alpha', to: 'Beta', fromPort: 'r', toPort: '1' },
        { key: -2, from: 'Alpha', to: 'Gamma', fromPort: 'b', toPort: 't' },
        { key: -3, from: 'Beta', to: 'Beta' },
        { key: -4, from: 'Gamma', to: 'Delta', fromPort: 'r', toPort: 'l' },
        { key: -5, from: 'Delta', to: 'Alpha', fromPort: 't', toPort: 'r' }
    ],
    diagramModelData: { prop: 'value' },
    skipsDiagramUpdate: false,
    selectedNodeData: null, // used by InspectorComponent

    // Palette state props
    paletteNodeData: [
      { key: 'PaletteNode1', color: 'firebrick' },
      { key: 'PaletteNode2', color: 'blueviolet' }
    ],
    paletteLinkData: [
      {
        points: new go.List(/*go.Point*/).addAll([new go.Point(0, 0), new go.Point(30, 0), new go.Point(30, 40), new go.Point(60, 40)]),
        strokeWidth: 4, dash: [6, 3]
      },
      { points: new go.List(/*go.Point*/).addAll([new go.Point(20, 20), new go.Point(60, 20), new go.Point(60, 40), new go.Point(60, 50)]) }
    ],
    paletteModelData: { prop: 'val' },
    skipsPaletteUpdate: false
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
          $(go.Shape, 'RoundedRectangle', { stroke: null },
            new go.Binding('fill', 'color', (c, panel) => {
             
              return c;
            })
          ),
          $(go.TextBlock, { margin: 8, editable: true },
            new go.Binding('text').makeTwoWay())
        ),
        // Ports
        makePort('t', go.Spot.TopCenter),
        makePort('l', go.Spot.Left),
        makePort('r', go.Spot.Right),
        makePort('b', go.Spot.BottomCenter)
      );

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

      palette.linkTemplate = $(go.Link,
        { // because the GridLayout.alignment is Location and the nodes have locationSpot == Spot.Center,
          // to line up the Link in the same manner we have to pretend the Link has the same location spot
          locationSpot: go.Spot.Center,
          selectionAdornmentTemplate:
            $(go.Adornment, 'Link',
              { locationSpot: go.Spot.Center },
              $(go.Shape,
                { isPanelMain: true, fill: null, stroke: 'deepskyblue', strokeWidth: 0 }, new go.Binding('strokeDashArray', 'dash')),
              $(go.Shape,  // the arrowhead
                { toArrow: 'Standard', stroke: null })
            )
        },
        {
          routing: go.Link.AvoidsNodes,
          curve: go.Link.JumpOver,
          corner: 5,
          toShortLength: 4
        },
        new go.Binding('points'),
        $(go.Shape,  // the link path shape
          { isPanelMain: true }, new go.Binding('strokeDashArray', 'dash')),
        $(go.Shape,  // the arrowhead
          { toArrow: 'Standard', stroke: null })
      )

    palette.model = $(go.GraphLinksModel,
      {
        linkKeyProperty: 'key'  // IMPORTANT! must be defined for merges and data sync when using GraphLinksModel
      });

    return palette;
  }
  
  // When the palette model changes, update app data to reflect those changes. Be sure to use immer's "produce" function to preserve immutability
  public paletteModelChange = function(changes: go.IncrementalData) {  
    this.state = produce(this.state, draft => {
      // set skipsPaletteUpdate: true since GoJS already has this update
      // this way, we don't log an unneeded transaction in the Palette's undoManager history
      draft.skipsPaletteUpdate = true;
      draft.paletteNodeData = DataSyncService.syncNodeData(changes, draft.paletteNodeData);
      draft.paletteLinkData = DataSyncService.syncLinkData(changes, draft.paletteLinkData);
      draft.paletteModelData = DataSyncService.syncModelData(changes, draft.paletteModelData);
    });
  };

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

