import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';

import {AppComponent} from './app.component';
import {CommonModule} from "@angular/common";
import {NgbModule} from '@ng-bootstrap/ng-bootstrap';
import {NumberNgForPipe} from "./pipes.pipe";

@NgModule({
    declarations: [
        AppComponent,
        NumberNgForPipe
    ],
    imports: [
        BrowserModule,
        CommonModule,
        NgbModule,
    ],
    providers: [],
    bootstrap: [AppComponent]
})
export class AppModule {
}
