import CTBaseInterfaces = require("./Base/CanvasTools.Base.Interfaces");
import IBase = CTBaseInterfaces.CanvasTools.Base.Interfaces;
import CTBaseRect = require("./Base/CanvasTools.Base.Rect");
import Rect = CTBaseRect.CanvasTools.Base.Rect.Rect;
import CTBasePoint = require("./Base/CanvasTools.Base.Point2D");
import Point2D = CTBasePoint.CanvasTools.Base.Point.Point2D;

import * as Snap from "snapsvg";

export module CanvasTools.Selection {    
    
    abstract class ElementPrototype implements IBase.IHideable, IBase.IResizable {
        protected paper: Snap.Paper;
        protected boundRect: Rect;
        public node: Snap.Element;

        protected isVisible:boolean = true;

        constructor(paper:Snap.Paper, boundRect: Rect) {
            this.paper = paper;
            this.boundRect = boundRect;
        }

        public hide() {
            if (this.isVisible) {
                this.node.node.setAttribute("visibility", "hidden");
                this.isVisible = false;
            }
        }

        public show() {
            if (!this.isVisible) {
                this.node.node.setAttribute("visibility", "visible");
                this.isVisible = true;
            }
        }

        public resize(width: number, height: number) {
            this.boundRect.resize(width, height);
        }
    }


    class CrossElement extends ElementPrototype implements IBase.IPoint2D {
        private hl: Snap.Element;
        private vl: Snap.Element;
        public x: number;
        public y: number;

        constructor(paper: Snap.Paper, boundRect: Rect){
            super(paper, boundRect);
            this.buildUIElements();
        }

        private buildUIElements() {
            let verticalLine: Snap.Element = this.paper.line(0, 0, 0, this.boundRect.height);
            let horizontalLine: Snap.Element = this.paper.line(0, 0, this.boundRect.width, 0);

            this.node = this.paper.g();
            this.node.addClass("crossStyle");
            this.node.add(verticalLine);
            this.node.add(horizontalLine);

            this.hl = horizontalLine;
            this.vl = verticalLine;
            this.x = 0;
            this.y = 0;

            this.hide();
        }

        public boundToRect(rect: IBase.IRect): Point2D {
            return new Point2D(this.x, this.y).boundToRect(rect);
        }

        public move(p: IBase.IPoint2D, rect:IBase.IRect, square:boolean = false, ref: IBase.IPoint2D = null) {
            let np:Point2D = p.boundToRect(rect); 

            if (square) {
                let dx = Math.abs(np.x - ref.x);
                let vx = Math.sign(np.x - ref.x);
                let dy = Math.abs(np.y - ref.y);
                let vy = Math.sign(np.y - ref.y);

                let d = Math.min(dx, dy);
                np.x = ref.x + d * vx;
                np.y = ref.y + d * vy;
            }

            this.x = np.x;
            this.y = np.y;  
            
            this.vl.node.setAttribute("x1", np.x.toString());
            this.vl.node.setAttribute("x2", np.x.toString());
            this.vl.node.setAttribute("y2", rect.height.toString());

            this.hl.node.setAttribute("y1", np.y.toString());
            this.hl.node.setAttribute("x2", rect.width.toString());
            this.hl.node.setAttribute("y2", np.y.toString());
        }

        public resize(width: number, height: number) {
            super.resize(width, height);
            this.vl.node.setAttribute("y2", height.toString());
            this.hl.node.setAttribute("x2", width.toString());
        }
    }

    class RectElement extends ElementPrototype {
        public rect: Rect;

        constructor(paper: Snap.Paper, boundRect:Rect, rect: Rect){
            super(paper, boundRect);
            this.rect = rect;
            this.buildUIElements();
            this.hide();
        }

        private buildUIElements(){
            this.node = this.paper.rect(0, 0, this.rect.width, this.rect.height);
    
        }

        public move(p: IBase.IPoint2D) {           
            this.node.node.setAttribute("x", p.x.toString());
            this.node.node.setAttribute("y", p.y.toString());
        }

        public resize(width: number, height: number){
            this.rect.resize(width, height);
            this.node.node.setAttribute("height", height.toString());
            this.node.node.setAttribute("width", width.toString());
        }
    }

    class MaskElement extends ElementPrototype {
        private mask: RectElement;
        private maskIn: RectElement;        
        private maskOut: { node: Snap.Element };       

        constructor(paper:Snap.Paper, boundRect: Rect, maskOut: { node: Snap.Element }) {
            super(paper, boundRect);
            this.maskOut = maskOut;
            this.buildUIElements();
            this.resize(boundRect.width, boundRect.height);
        }

        private buildUIElements() {
            this.mask = this.createMask();

            this.maskIn = this.createMaskIn();
            this.maskOut.node.addClass("maskOutStyle");

            let combinedMask = this.paper.g();
                combinedMask.add(this.maskIn.node);
                combinedMask.add(this.maskOut.node);

            this.mask.node.attr({
                mask: combinedMask
            });

            this.node = this.mask.node;
            this.hide();
        }

        private createMask(): RectElement {
            let r:RectElement = new RectElement(this.paper, this.boundRect, this.boundRect);
            r.node.addClass("maskStyle");
            return r;
        }

        private createMaskIn(): RectElement {
            let r:RectElement = new RectElement(this.paper, this.boundRect, this.boundRect);            
            r.node.addClass("maskInStyle");
            return r;
        }
 
        public resize(width: number, height: number){
            super.resize(width, height);
            this.mask.resize(width, height);
            this.maskIn.resize(width, height);
        }
    }

    /* SELECTORS */
    export enum SelectionMode { RECT, COPYRECT };
    export enum SelectionModificator { RECT, SQUARE };

    type EventDescriptor = {
        event: string, 
        listener: (e:PointerEvent|MouseEvent|KeyboardEvent) => void, 
        base: SVGSVGElement | HTMLElement | Window, 
        bypass: boolean
    };

    abstract class SelectorPrototype extends ElementPrototype {
        protected isLocked: boolean = false;
        protected isEnabled: boolean = true;

        // Call backs
        public onSelectionBeginCallback: Function;
        public onSelectionEndCallback: Function;
        public onLockedCallback: Function;
        public onUnlockedCallback: Function;

        constructor(paper: Snap.Paper, boundRect: Rect, callbacks?: { onSelectionBegin: Function, onSelectionEnd: Function, onLocked: Function, onUnlocked: Function }) {
            super(paper, boundRect);      
            
            if (callbacks !== undefined) {
                this.onSelectionBeginCallback = callbacks.onSelectionBegin;
                this.onSelectionEndCallback = callbacks.onSelectionEnd;
                this.onLockedCallback = callbacks.onLocked;
                this.onUnlockedCallback = callbacks.onUnlocked;
            }
        }

        public enable() {
            if (!this.isEnabled) {
                this.isEnabled = true;
                this.show();
            }
        }

        public disable() {
            if(!this.isLocked && this.isEnabled) {
                this.isEnabled = false;
                this.hide();
            }
        }

        public lock() {
            this.isLocked = true;
            this.enable();
            if (this.onLockedCallback instanceof Function) {
                this.onLockedCallback();
            }
        }

        public unlock() {
            this.isLocked = false;
            if (this.onUnlockedCallback instanceof Function) {
                this.onUnlockedCallback();
            }
        }

        public toggleLockState() {
            if (this.isLocked) {
                this.unlock();
            } else {
                this.lock();
            }
        }

        // helper functions
        protected subscribeToEvents(listeners: Array<EventDescriptor>) {
            listeners.forEach(e => {
                e.base.addEventListener(e.event, this.enablify(e.listener.bind(this), e.bypass));            
            });
        }


        protected enablify(f:Function, bypass:boolean = false) {
            return (args:PointerEvent|KeyboardEvent) => {
                if (this.isEnabled || bypass) {
                    f(args);
                }
            }
        }

        protected showAll(elements: Array<IBase.IHideable>) {
            window.requestAnimationFrame(() => {
                elements.forEach(element => {
                    element.show();                
                });    
            })            
        }

        protected hideAll(elements: Array<IBase.IHideable>) {
            window.requestAnimationFrame(() => {
                elements.forEach(element => {
                    element.hide();                
                }); 
            })            
        }

        protected resizeAll(elementSet: Array<IBase.IResizable>) {
            window.requestAnimationFrame(() => {
                elementSet.forEach(element => {
                    element.resize(this.boundRect.width, this.boundRect.height);                
                });
            })            
        }
    }

    export class RectSelector extends SelectorPrototype {
        private parentNode: SVGSVGElement;
        private crossA: CrossElement;
        private crossB: CrossElement;
        private selectionBox: RectElement;
        private mask: MaskElement;

        private capturingState:boolean = false;
        private isTwoPoints:boolean = false;

        private selectionModificator: SelectionModificator = SelectionModificator.RECT;

        constructor(parent: SVGSVGElement, paper: Snap.Paper, boundRect: Rect, callbacks?: { onSelectionBegin: Function, onSelectionEnd: Function, onLocked: Function, onUnlocked: Function }) {
            super(paper, boundRect, callbacks);
            this.parentNode = parent;
            this.buildUIElements();
        }

        private buildUIElements() {
            this.node = this.paper.g();
            this.node.addClass("RectSelector");
            this.crossA = this.createCross();
            this.crossB = this.createCross();
            this.selectionBox = this.createSelectionBox();
            this.mask = this.createMask(this.selectionBox);

            this.node.add(this.mask.node);
            this.node.add(this.crossA.node);
            this.node.add(this.crossB.node);

            let listeners: Array<EventDescriptor> = [
                {event: "pointerenter", listener: this.onPointerEnter, base: this.parentNode, bypass: false},
                {event: "pointerleave", listener: this.onPointerLeave, base: this.parentNode, bypass: false},
                {event: "pointerdown", listener: this.onPointerDown, base: this.parentNode, bypass: false},
                {event: "pointerup", listener: this.onPointerUp, base: this.parentNode, bypass: false},
                {event: "pointermove", listener: this.onPointerMove, base: this.parentNode, bypass: false},
                {event: "keydown", listener: this.onKeyDown, base: window, bypass: false},
                {event: "keyup", listener: this.onKeyUp, base: window, bypass: true},
            ];

            this.subscribeToEvents(listeners);
        }

        private createSelectionBox(): RectElement {
            let r:RectElement = new RectElement(this.paper, this.boundRect, new Rect(0, 0));
            r.node.addClass("selectionBoxStyle");
            return r;
        }

        private createMask(selectionBox: RectElement): MaskElement
        {
            return new MaskElement(this.paper, this.boundRect, selectionBox);
        }

        private createCross(): CrossElement {
            let cr:CrossElement = new CrossElement(this.paper, this.boundRect);  
            return cr;
        }

        private moveCross(cross:CrossElement, p:IBase.IPoint2D, square:boolean = false, refCross: CrossElement = null) {
            cross.move(p, this.boundRect, square, refCross);
        }   
        
        private moveSelectionBox(box: RectElement, crossA:CrossElement, crossB: CrossElement) {
            var x = (crossA.x < crossB.x) ? crossA.x : crossB.x;
            var y = (crossA.y < crossB.y) ? crossA.y : crossB.y;
            var w = Math.abs(crossA.x - crossB.x);
            var h = Math.abs(crossA.y - crossB.y);

            box.move(new Point2D(x, y));
            box.resize(w, h);
        }

        // Events
        private onPointerEnter(e:PointerEvent) {
            window.requestAnimationFrame(() => {
                this.crossA.show();
            })            
        }

        private onPointerLeave(e:PointerEvent) {
            window.requestAnimationFrame(() => {
                let rect = this.parentNode.getClientRects();
                let p = new Point2D(e.clientX - rect[0].left, e.clientY - rect[0].top);

                if (!this.capturingState) {
                    this.hideAll([this.crossA, this.crossB, this.selectionBox]);
                } else if (this.isTwoPoints && this.capturingState) {
                    this.moveCross(this.crossB, p);
                    this.moveSelectionBox(this.selectionBox, this.crossA, this.crossB);
                }
            });
            
        }

        private onPointerDown(e:PointerEvent) {
            window.requestAnimationFrame(() => {
                if (!this.isTwoPoints) {
                    this.capturingState = true;

                    this.parentNode.setPointerCapture(e.pointerId);
                    this.moveCross(this.crossB, this.crossA);
                    this.moveSelectionBox(this.selectionBox, this.crossA, this.crossB);

                    this.showAll([this.mask, this.crossB, this.selectionBox]);

                    if (typeof this.onSelectionBeginCallback === "function") {
                        this.onSelectionBeginCallback();
                    }
                } 
            });         
        }

        private onPointerUp(e:PointerEvent) {
            window.requestAnimationFrame(() => {
                let rect = this.parentNode.getClientRects();
                let p = new Point2D(e.clientX - rect[0].left, e.clientY - rect[0].top);
                
                if (!this.isTwoPoints) { 
                    this.capturingState = false;
                    this.parentNode.releasePointerCapture(e.pointerId);                    
                    this.hideAll([this.crossB, this.mask]);
                    
                    if (typeof this.onSelectionEndCallback === "function") {
                        this.onSelectionEndCallback(this.crossA.x, this.crossA.y, this.crossB.x, this.crossB.y);
                    }
                } 
                else {
                    if (this.capturingState) {
                        this.capturingState = false;
                        this.hideAll([this.crossB, this.mask]);

                        if (typeof this.onSelectionEndCallback === "function") {
                            this.onSelectionEndCallback(this.crossA.x, this.crossA.y, this.crossB.x, this.crossB.y);
                        }
                        this.moveCross(this.crossA, p);
                        this.moveCross(this.crossB, p);
                    } else {
                        this.capturingState = true;
                        this.moveCross(this.crossB, p);
                        this.moveSelectionBox(this.selectionBox, this.crossA, this.crossB);
                        this.showAll([this.crossA, this.crossB, this.selectionBox, this.mask]);

                        if (typeof this.onSelectionBeginCallback === "function") {
                            this.onSelectionBeginCallback();
                        }
                    }
                } 
            });
        }

        private onPointerMove(e:PointerEvent) {
            window.requestAnimationFrame(() => {
                let rect = this.parentNode.getClientRects();
                let p = new Point2D(e.clientX - rect[0].left, e.clientY - rect[0].top);

                this.crossA.show();

                if (!this.isTwoPoints) {
                    if (this.capturingState) {
                        this.moveCross(this.crossB, p, this.selectionModificator === SelectionModificator.SQUARE, this.crossA);                    
                        this.moveSelectionBox(this.selectionBox, this.crossA, this.crossB);
                    } else {
                        this.moveCross(this.crossA, p);
                    }
                } else {
                    if (this.capturingState) {
                        this.moveCross(this.crossB, p, this.selectionModificator === SelectionModificator.SQUARE, this.crossA);                    
                        this.moveSelectionBox(this.selectionBox, this.crossA, this.crossB);
                    } else {
                        this.moveCross(this.crossA, p);
                        this.moveCross(this.crossB, p);
                    }
                } 
            });

            e.preventDefault();
        }

        private onKeyDown(e:KeyboardEvent) {
            //Holding shift key enable square drawing mode
            if (e.shiftKey) {
                this.selectionModificator = SelectionModificator.SQUARE;
            } 

            if (e.ctrlKey && !this.capturingState) {
                this.isTwoPoints = true;                   
            }
        }

        private onKeyUp(e:KeyboardEvent) {
            //Holding shift key enable square drawing mode
            if (!e.shiftKey) {
                this.selectionModificator = SelectionModificator.RECT;
            }

            //Holding Ctrl key to enable two point selection mode
            if (!e.ctrlKey && this.isTwoPoints) {
                this.isTwoPoints = false;
                this.capturingState = false;
                this.moveCross(this.crossA, this.crossB);
                this.hideAll([this.crossB, this.selectionBox, this.mask]);
            }

            // L key to lock/unlock selection to allow adding new regions on top of others
            if(e.code === 'KeyL') {
                this.toggleLockState();
            } 
            //Escape to exit exclusive mode
            if(e.keyCode == 27) {
                this.unlock();
            }
        }

    }

    export class RectCopySelector extends SelectorPrototype{
        private parentNode: SVGSVGElement;

        private copyRect: Rect;

        private crossA: CrossElement;        
        private copyRectEl: RectElement;

        constructor(parent: SVGSVGElement, paper: Snap.Paper, boundRect: Rect, copyRect: Rect, callbacks?: { onSelectionBegin: Function, onSelectionEnd: Function, onLocked: Function, onUnlocked: Function }) {
            super(paper, boundRect, callbacks);
            this.parentNode = parent;
            this.copyRect = copyRect;
            this.buildUIElements();
        }

        private buildUIElements() {
            this.node = this.paper.g();
            this.node.addClass("RectCopySelector");

            this.crossA = this.createCross();
            this.copyRectEl = this.createCopyRect();

            this.node.add(this.crossA.node);
            this.node.add(this.copyRectEl.node);

            let listeners: Array<EventDescriptor> = [
                {event: "pointerenter", listener: this.onPointerEnter, base: this.parentNode, bypass: false},
                {event: "pointerleave", listener: this.onPointerLeave, base: this.parentNode, bypass: false},
                {event: "pointerdown", listener: this.onPointerDown, base: this.parentNode, bypass: false},
                {event: "pointerup", listener: this.onPointerUp, base: this.parentNode, bypass: false},
                {event: "pointermove", listener: this.onPointerMove, base: this.parentNode, bypass: false},
                {event: "keydown", listener: this.onKeyDown, base: window, bypass: false},
                {event: "keyup", listener: this.onKeyUp, base: window, bypass: true},
            ];

            this.subscribeToEvents(listeners);
        }

        private createCross(): CrossElement {
            let cr:CrossElement = new CrossElement(this.paper, this.boundRect);  
            return cr;
        }

        private createCopyRect(): RectElement {
            let r: RectElement = new RectElement(this.paper, this.boundRect, this.copyRect);
            r.node.addClass("copyRectStyle");
            return r;
        }

        private moveCross(cross:CrossElement, p:IBase.IPoint2D, square:boolean = false, refCross: CrossElement = null) {
            cross.move(p, this.boundRect, square, refCross);
        }       
        
        private moveCopyRect(copyRect: RectElement, crossA:CrossElement) {
            var x = crossA.x - copyRect.rect.width/2;
            var y = crossA.y - copyRect.rect.height/2;
            copyRect.move(new Point2D(x, y));
        }

        public setTemplate(copyRect: Rect) {
            this.copyRect = copyRect;

            this.copyRectEl.resize(copyRect.width, copyRect.height);
            this.moveCopyRect(this.copyRectEl, this.crossA);
        }

        private onPointerEnter(e:PointerEvent) {
            window.requestAnimationFrame(() => {
                this.crossA.show();
                this.copyRectEl.show();
            })            
        }

        private onPointerLeave(e:PointerEvent) {
            window.requestAnimationFrame(() => {
                this.hide();
            });            
        }

        private onPointerDown(e:PointerEvent) {
            window.requestAnimationFrame(() => {
                this.show();
                this.moveCopyRect(this.copyRectEl, this.crossA);
                if (typeof this.onSelectionBeginCallback === "function") {
                    this.onSelectionBeginCallback();
                }
            });         
        }

        private onPointerUp(e:PointerEvent) {
            window.requestAnimationFrame(() => {
                if (typeof this.onSelectionEndCallback === "function") {
                    let p1 = new Point2D(this.crossA.x - this.copyRect.width / 2, this.crossA.y - this.copyRect.height / 2);
                    let p2 = new Point2D(this.crossA.x + this.copyRect.width / 2, this.crossA.y + this.copyRect.height / 2);
                    p1 = p1.boundToRect(this.boundRect);
                    p2 = p2.boundToRect(this.boundRect);
                    this.onSelectionEndCallback(p1.x, p1.y, p2.x, p2.y);
                }
            });
        }

        private onPointerMove(e:PointerEvent) {
            window.requestAnimationFrame(() => {
                let rect = this.parentNode.getClientRects();
                let p = new Point2D(e.clientX - rect[0].left, e.clientY - rect[0].top);

                this.crossA.show();

                this.copyRectEl.show();
                this.moveCross(this.crossA, p);
                this.moveCopyRect(this.copyRectEl, this.crossA);
            });

            e.preventDefault();
        }

        private onKeyDown(e:KeyboardEvent) {
        }

        private onKeyUp(e:KeyboardEvent) {
            // L key to lock/unlock selection to allow adding new regions on top of others
            if(e.code === 'KeyL') {
                this.toggleLockState();
            } 
            //Escape to exit exclusive mode
            if(e.keyCode == 27) {
                this.unlock();
            }
        }
    }

    export class AreaSelector {
        private parentNode:SVGSVGElement;
        private paper: Snap.Paper;
        private boundRect: Rect;

        private areaSelectorLayer: Snap.Element;

        private selector: SelectorPrototype;
        
        private rectSelector: RectSelector;
        private rectCopySelector: RectCopySelector;

        public onSelectionBeginCallback: Function;
        public onSelectionEndCallback: Function;
        public onLockedCallback: Function;
        public onUnlockedCallback: Function;

        private isEnabled: boolean = true;
        public static DefaultTemplateSize: Rect = new Rect(20, 20);

        constructor(svgHost: SVGSVGElement, callbacks?: { onSelectionBegin: Function, onSelectionEnd: Function, onLocked: Function, onUnlocked: Function }){
            this.parentNode = svgHost;
            if (callbacks !== undefined) {
                this.onSelectionBeginCallback = callbacks.onSelectionBegin;
                this.onSelectionEndCallback = callbacks.onSelectionEnd;
                this.onLockedCallback = callbacks.onLocked;
                this.onUnlockedCallback = callbacks.onUnlocked;
            }

            this.buildUIElements();
            this.subscribeToEvents();
        }

        private buildUIElements() {
            this.paper = Snap(this.parentNode);
            this.boundRect = new Rect(this.parentNode.width.baseVal.value, this.parentNode.height.baseVal.value);

            this.areaSelectorLayer = this.paper.g();
            this.areaSelectorLayer.addClass("areaSelector");

            this.rectSelector = new RectSelector(this.parentNode, this.paper, this.boundRect, {
                onSelectionBegin: this.onSelectionBeginCallback,
                onSelectionEnd: this.onSelectionEndCallback,
                onLocked: this.onLockedCallback,
                onUnlocked: this.onUnlockedCallback
            });

            this.rectCopySelector = new RectCopySelector(this.parentNode, this.paper, this.boundRect, new Rect(0, 0), {
                onSelectionBegin: this.onSelectionBeginCallback,
                onSelectionEnd: this.onSelectionEndCallback,
                onLocked: this.onLockedCallback,
                onUnlocked: this.onUnlockedCallback
            });

            this.selector = this.rectSelector;  
            this.rectSelector.enable();
            this.rectCopySelector.disable();          
            this.selector.hide();

            this.areaSelectorLayer.add(this.rectSelector.node);
            this.areaSelectorLayer.add(this.rectCopySelector.node);
        }

        public resize(width:number, height:number):void {
            if (width !== undefined && height !== undefined) {
                this.boundRect.resize(width, height);
                this.parentNode.style.width = width.toString();
                this.parentNode.style.height = height.toString();
            } else {
                this.boundRect.resize(this.parentNode.width.baseVal.value, this.parentNode.height.baseVal.value);
            }

            this.selector.resize(width, height);
        }

        private onKeyUp(e:KeyboardEvent) {
            // L key to lock/unlock selection to allow adding new regions on top of others
            if(e.code === 'KeyL') {
                this.toggleLockState();
            } 
            //Escape to exit exclusive mode
            if(e.keyCode == 27) {
                this.unlock();
            }
        }

        private subscribeToEvents() {
            let listeners = [
                {event: "keyup", listener: this.onKeyUp, base: window, bypass: true},
            ];

            listeners.forEach(e => {
                e.base.addEventListener(e.event, this.enablify(e.listener.bind(this), e.bypass));            
            });
        }

        private toggleLockState() {
            this.selector.toggleLockState();
        }

        public lock() {
            this.selector.lock();
        }

        public unlock() {
            this.selector.unlock();
        }

        public enable() {
            this.selector.enable();
        }

        public disable() {
            this.selector.disable();
        }

        public setSelectionMode(selectionMode: SelectionMode, options?: { template?: Rect }) {
            this.selector.disable();
            this.selector.hide();

            if (selectionMode === SelectionMode.COPYRECT) {
                this.selector = this.rectCopySelector;
                if (options !== undefined && options.template !== undefined) {
                    this.rectCopySelector.setTemplate(options.template);
                } else {
                    this.rectCopySelector.setTemplate(AreaSelector.DefaultTemplateSize);
                }
            } else if (selectionMode === SelectionMode.RECT) {
                this.selector = this.rectSelector;
            }

            this.selector.show();
            this.selector.enable();
        }

        protected enablify(f:Function, bypass:boolean = false) {
            return (args:PointerEvent|KeyboardEvent) => {
                if (this.isEnabled || bypass) {
                    f(args);
                }
            }
        }
    }
}