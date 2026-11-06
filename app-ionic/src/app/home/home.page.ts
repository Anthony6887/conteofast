
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonContent, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowForwardOutline, clipboardOutline } from 'ionicons/icons';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    RouterLink,
    IonContent,
    IonIcon
  ],
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss']
})
export class HomePage {

  constructor() {
    addIcons({
      arrowForwardOutline,
      clipboardOutline
    });
  }

}
